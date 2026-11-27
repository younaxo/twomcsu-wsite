package ru.twomc.bridge;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.DoubleSupplier;
import java.util.function.LongSupplier;
import java.util.logging.Logger;

/**
 * Исходящая очередь событий-снимков (player.stats.snapshot, inventory.snapshot) в POST /bridge/v1/events.
 *
 * <p>Всё состояние принадлежит потоку ввода-вывода {@link Scheduler}; из главного потока вызывается только
 * {@link #submit}, он лишь передаёт работу планировщику. Пачки идут строго по одной (контракт 5.3: следующая после
 * ответа на предыдущую), {@code seq} растёт без пропусков внутри {@code streamId}.
 *
 * <p>Снимок - это состояние, а не журнал: новый снимок с тем же ключом заменяет ещё не отправленный старый
 * (в очереди не больше одного снимка на ключ). Повтор отправляет ТУ ЖЕ пачку (те же eventId и seq) только для 503,
 * 429, 5xx и сетевых ошибок; {@code invalid_data} и другие отказы по событию не повторяются.
 */
final class EventPipeline {
    /** Результат обработки одного события, для вызывающей логики (счётчики, безопасный режим). */
    interface Listener {
        /** @param status accepted|duplicate|stale|rejected; code для rejected (может быть null) */
        void onResult(Pending p, String status, String code);
    }

    /** Событие в очереди. Поля eventId и seq заполняются при сборке пачки. */
    static final class Pending {
        final String type;
        final String key;
        final long occurredAtMs;
        final String dataJson;
        /** Произвольные данные вызывающей стороны (например, хеш содержимого); в сеть не уходят. */
        final Object meta;
        String eventId;
        long seq;

        Pending(String type, String key, long occurredAtMs, String dataJson, Object meta) {
            this.type = type;
            this.key = key;
            this.occurredAtMs = occurredAtMs;
            this.dataJson = dataJson;
            this.meta = meta;
        }
    }

    record Status(int queued, int inFlight, long sent, long accepted, long rejected, long dropped, String last) {}

    static final int MAX_QUEUED = 1000;
    static final long BATCH_GAP_MS = 250;
    static final int AUTH_RETRIES = 3;
    static final long AUTH_PAUSE_MS = 5 * 60_000L;
    static final long FATAL_PAUSE_MS = 60_000L;
    /** Снимок старше этого возраста при повторе уже не нужен (появится новый); приёмник принимает до 7 суток. */
    static final long MAX_RETRY_AGE_MS = 60 * 60_000L;
    /** После unsupported_type тип не шлётся столько мс (возможность или флаг на сайте выключены). */
    static final long UNSUPPORTED_BLOCK_MS = 30 * 60_000L;

    private final BridgeApi api;
    private final Scheduler scheduler;
    private final LongSupplier clock;
    private final DoubleSupplier random;
    private final Logger log;
    private final String serverId;
    private final String streamId;
    private final Listener listener;

    // Состояние потока ввода-вывода.
    private final LinkedHashMap<String, Pending> queue = new LinkedHashMap<>();
    private List<Pending> inFlight = null;
    private int attempt = 0;
    private int authAttempts = 0;
    private long pausedUntil = 0;
    private boolean pumpScheduled = false;
    private long nextSeq = 1;
    private boolean stopped = false;

    // Видимо из других потоков.
    private final Map<String, Long> blockedUntil = new ConcurrentHashMap<>();
    private volatile long sent, accepted, rejected, dropped;
    private volatile int queuedView, inFlightView;
    private volatile String last = "ещё не отправляли";
    private final Map<String, Long> lastWarnAt = new ConcurrentHashMap<>();

    EventPipeline(BridgeApi api, Scheduler scheduler, LongSupplier clock, DoubleSupplier random, Logger log,
                  String serverId, String streamId, Listener listener) {
        this.api = api;
        this.scheduler = scheduler;
        this.clock = clock;
        this.random = random;
        this.log = log;
        this.serverId = serverId;
        this.streamId = streamId;
        this.listener = listener;
    }

    /** Тип сейчас заблокирован из-за unsupported_type (можно не собирать снимок). */
    boolean isBlocked(String type) {
        Long until = blockedUntil.get(type);
        return until != null && until > clock.getAsLong();
    }

    /** Потокобезопасно: вызывается из главного потока. */
    void submit(Pending p) {
        if (isBlocked(p.type)) {
            return;
        }
        scheduler.execute(() -> {
            try {
                if (stopped) return;
                queue.remove(p.key); // новый снимок заменяет ещё не отправленный и встаёт в конец
                queue.put(p.key, p);
                while (queue.size() > MAX_QUEUED) {
                    Iterator<Pending> it = queue.values().iterator();
                    it.next();
                    it.remove();
                    dropped++;
                    warnLimited("overflow", "очередь снимков переполнена (" + MAX_QUEUED + "), самый старый отброшен");
                }
                queuedView = queue.size();
                schedulePump(0);
            } catch (RuntimeException e) {
                warnLimited("submit-error", "ошибка постановки в очередь (" + e.getClass().getSimpleName() + ")");
            }
        });
    }

    /** Остановка: больше ничего не принимает. Незавершённое не сохраняется (снимки возобновятся после старта). */
    void stop() {
        scheduler.execute(() -> stopped = true);
    }

    /** Одна попытка отправить накопленное при остановке сервера (без повторов), не дольше timeoutMs. */
    void flushOnce(long timeoutMs) {
        scheduler.runAndAwait(() -> {
            if (stopped) return;
            pumpOnce(false);
            stopped = true;
        }, timeoutMs);
    }

    Status status() {
        return new Status(queuedView, inFlightView, sent, accepted, rejected, dropped, last);
    }

    // ---- поток ввода-вывода ----

    private void schedulePump(long delayMs) {
        if (pumpScheduled || stopped) return;
        pumpScheduled = true;
        scheduler.schedule(delayMs, () -> {
            pumpScheduled = false;
            try {
                pumpOnce(true);
            } catch (RuntimeException e) {
                // Исключение не должно молча остановить отправку: пачка (inFlight) остаётся, повтор с backoff.
                attempt++;
                long delay = Backoff.delayMs(attempt, null, random);
                pausedUntil = clock.getAsLong() + delay;
                warnLimited("pump-error", "ошибка отправки (" + e.getClass().getSimpleName() + "), повтор через " + (delay / 1000) + " с");
                if (inFlight != null || !queue.isEmpty()) schedulePump(delay);
            }
        });
    }

    private void pumpOnce(boolean allowReschedule) {
        if (stopped && allowReschedule) return;
        long now = clock.getAsLong();
        if (now < pausedUntil) {
            if (allowReschedule) schedulePump(pausedUntil - now);
            return;
        }
        if (inFlight == null) {
            inFlight = buildBatch(now);
            attempt = 0;
        } else {
            dropExpired(now);
        }
        inFlightView = inFlight == null ? 0 : inFlight.size();
        queuedView = queue.size();
        if (inFlight == null || inFlight.isEmpty()) {
            inFlight = null;
            inFlightView = 0;
            // Пачка целиком устарела и отброшена, а в очереди есть новое: без этого оно ждало бы следующего submit.
            if (allowReschedule && !queue.isEmpty()) schedulePump(BATCH_GAP_MS);
            return;
        }
        List<EventsProtocol.OutEvent> out = new ArrayList<>();
        for (Pending p : inFlight) {
            out.add(new EventsProtocol.OutEvent(p.eventId, p.type, p.seq, p.occurredAtMs, p.dataJson));
        }
        byte[] body = EventsProtocol.body(serverId, streamId, now, out);
        sent += out.size();
        BridgeApi.Result<List<EventsProtocol.EventResult>> res = api.events(body);
        handle(res, allowReschedule);
    }

    private List<Pending> buildBatch(long now) {
        if (queue.isEmpty()) return null;
        List<Pending> batch = new ArrayList<>();
        long bytes = 0;
        Iterator<Pending> it = queue.values().iterator();
        while (it.hasNext() && batch.size() < EventsProtocol.MAX_EVENTS_PER_BATCH) {
            Pending p = it.next();
            long size = p.dataJson.length() * 3L + 300; // верхняя оценка UTF-8 и конверта
            if (!batch.isEmpty() && bytes + size > EventsProtocol.MAX_BODY_BYTES) break;
            it.remove();
            p.eventId = UuidV7.generate(now);
            p.seq = nextSeq++;
            batch.add(p);
            bytes += size;
        }
        return batch;
    }

    private void dropExpired(long now) {
        inFlight.removeIf(p -> {
            boolean old = now - p.occurredAtMs > MAX_RETRY_AGE_MS;
            if (old) dropped++;
            return old;
        });
    }

    private void handle(BridgeApi.Result<List<EventsProtocol.EventResult>> res, boolean allowReschedule) {
        switch (res.kind()) {
            case OK -> {
                attempt = 0;
                authAttempts = 0;
                applyResults(res.value());
                last = "ответ сайта получен";
                afterBatch(allowReschedule);
            }
            case RETRYABLE -> {
                attempt++;
                last = "повтор: " + (res.status() == 0 ? res.errorCode() : "HTTP " + res.status());
                long delay = Backoff.delayMs(attempt, res.retryAfterSeconds(), random);
                warnLimited("retry", "события не доставлены (" + last + "), повтор той же пачки через " + (delay / 1000) + " с");
                pausedUntil = clock.getAsLong() + delay;
                if (allowReschedule) schedulePump(delay);
            }
            case AUTH -> {
                authAttempts++;
                warnLimited("auth", "сайт отклонил подпись событий (401, расхождение часов: Date сайта=" + safeHeader(res.dateHeader())
                        + "); попытка " + authAttempts + " из " + AUTH_RETRIES);
                last = "401";
                long delay;
                if (authAttempts > AUTH_RETRIES) {
                    authAttempts = 0;
                    delay = AUTH_PAUSE_MS;
                    log.warning("Снимки: 401 после " + AUTH_RETRIES + " повторов, пауза 5 минут. Проверьте ключ сервера и время на хосте.");
                } else {
                    delay = Backoff.delayMs(authAttempts, res.retryAfterSeconds(), random);
                }
                pausedUntil = clock.getAsLong() + delay;
                if (allowReschedule) schedulePump(delay);
            }
            case FATAL -> {
                // 400/403/413/422/426: повтор той же пачки не поможет; пачка отбрасывается, снимки возобновятся новыми.
                int n = inFlight == null ? 0 : inFlight.size();
                dropped += n;
                inFlight = null;
                inFlightView = 0;
                last = "отказ запроса HTTP " + res.status() + (res.errorCode() == null ? "" : " " + res.errorCode());
                log.warning("Снимки: сайт отклонил пачку целиком (HTTP " + res.status()
                        + (res.errorCode() == null ? "" : ", " + res.errorCode()) + "), событий отброшено: " + n
                        + ". Пауза 60 с.");
                pausedUntil = clock.getAsLong() + FATAL_PAUSE_MS;
                if (allowReschedule && !queue.isEmpty()) schedulePump(FATAL_PAUSE_MS);
            }
        }
    }

    private void afterBatch(boolean allowReschedule) {
        queuedView = queue.size();
        inFlightView = inFlight == null ? 0 : inFlight.size();
        if (allowReschedule && (inFlight != null || !queue.isEmpty())) {
            schedulePump(inFlight != null ? Backoff.delayMs(1, null, random) : BATCH_GAP_MS);
        }
    }

    private void applyResults(List<EventsProtocol.EventResult> results) {
        Map<String, EventsProtocol.EventResult> byId = new LinkedHashMap<>();
        for (EventsProtocol.EventResult r : results) byId.put(r.eventId(), r);
        List<Pending> remaining = new ArrayList<>();
        for (Pending p : inFlight) {
            EventsProtocol.EventResult r = byId.get(p.eventId);
            if (r == null) {
                remaining.add(p); // ответа по событию нет: повторим то же событие
                continue;
            }
            switch (r.status()) {
                case "accepted", "duplicate" -> accepted++;
                case "stale" -> { /* приёмник уже имеет более свежее состояние */ }
                default -> {
                    rejected++;
                    onRejected(p, r.code());
                }
            }
            try {
                listener.onResult(p, r.status(), r.code());
            } catch (RuntimeException e) {
                log.warning("Снимки: ошибка обработки ответа (" + e.getClass().getSimpleName() + ")");
            }
        }
        inFlight = remaining.isEmpty() ? null : remaining;
        if (inFlight != null) {
            warnLimited("missing", "сайт не вернул результат по " + remaining.size() + " событиям, повторим");
        }
    }

    private void onRejected(Pending p, String code) {
        String c = code == null ? "unknown" : code;
        switch (c) {
            case "unsupported_type" -> {
                blockedUntil.put(p.type, clock.getAsLong() + UNSUPPORTED_BLOCK_MS);
                queue.values().removeIf(q -> q.type.equals(p.type));
                log.warning("Сайт не принимает " + p.type + " (unsupported_type): флаг приёма или возможность сервера "
                        + "выключены у владельца. Отправка этого типа приостановлена на 30 минут, повтора нет.");
            }
            case "server_mismatch" -> log.severe("Сайт ответил server_mismatch для " + p.type
                    + ": serverId в keyId не совпал с сервером. Проверьте delivery.keyId.");
            case "invalid_data" -> warnLimited("invalid:" + p.type, "сайт отклонил " + p.type + " как invalid_data, повтора нет"
                    + " (размер данных " + p.dataJson.length() + " симв.)");
            default -> warnLimited("rej:" + c + p.type, "сайт отклонил " + p.type + ": " + c + ", повтора нет");
        }
    }

    /** Заголовок из чужого ответа в лог: без управляющих символов (CR/LF не подделывают строки лога), не длиннее 64. */
    static String safeHeader(String v) {
        if (v == null) return "нет";
        String s = v.replaceAll("[\\p{Cntrl}]", "?");
        return s.length() > 64 ? s.substring(0, 64) + "..." : s;
    }

    /** Не чаще раза в минуту на ключ сообщения: поток отказов не должен заливать лог. */
    private void warnLimited(String key, String message) {
        long now = clock.getAsLong();
        Long prev = lastWarnAt.get(key);
        if (prev != null && now - prev < 60_000) return;
        lastWarnAt.put(key, now);
        log.warning("Снимки: " + message);
    }
}
