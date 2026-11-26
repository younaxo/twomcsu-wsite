package ru.twomc.bridge;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.DoubleSupplier;
import java.util.function.LongSupplier;
import java.util.logging.Logger;

import ru.twomc.bridge.DeliveryProtocol.AckItem;
import ru.twomc.bridge.DeliveryProtocol.AckResult;
import ru.twomc.bridge.DeliveryProtocol.AckStatus;
import ru.twomc.bridge.DeliveryProtocol.ClaimResponse;
import ru.twomc.bridge.DeliveryProtocol.Job;

/**
 * Оркестратор выдачи без зависимостей от Bukkit (проверяется unit-тестами).
 *
 * <p>Потоки: цикл опроса, подпись и HTTP работают ТОЛЬКО на потоке ввода-вывода ({@link Scheduler}); команда
 * исполняется ТОЛЬКО в главном потоке ({@link MainThread}); поток ввода-вывода главный поток не ждёт. Итог
 * каждого задания кладётся в очередь ack, которую поток ввода-вывода отправляет пачками до 20 и повторяет ВСЮ пачку
 * до accepted/duplicate. Новый claim не делается, пока очередь ack не пуста ИЛИ есть задания в работе (контракт 14.6).
 */
final class DeliveryEngine {
    /** Выполняет Runnable в главном потоке сервера; бросает RuntimeException, если планировщик недоступен. */
    interface MainThread {
        void run(Runnable r);
    }

    /**
     * Исполнение команды консольным отправителем (L1: трактовка {@code Bukkit.dispatchCommand}).
     *
     * <p>{@code true}: команда найдена и её обработчик не вернул отказ. Это НЕ доказательство, что игрок получил
     * выдачу (многие плагины печатают ошибку, но возвращают true). {@code false}: команда не найдена либо обработчик
     * вернул false (обычно показал справку по использованию). Плагин трактует false как «побочного эффекта нет»:
     * ответ ack {@code failed}, ключ получает состояние FAILED, а повтор того же заказа админом на сайте исполнит
     * команду снова. Если обработчик возвращает false ПОСЛЕ частичного эффекта, повтор может дать двойную выдачу:
     * проверяйте такие случаи вручную до повтора. Исключение из {@code dispatch} трактуется иначе: исход неизвестен
     * (ack {@code unknown}, повтор запрещён).
     *
     * @throws Exception любое исключение означает «исход неизвестен», не «команда не выполнялась»
     */
    interface CommandRunner {
        boolean dispatch(String command) throws Exception;
    }

    record Status(boolean storeHealthy, int storeSize, int outbox, int inFlight, long pausedForMs, String last) {}

    private static final long ACK_MAX_AGE_MS = 24L * 60 * 60 * 1000;
    private static final int MAX_ACK_BATCHES_PER_CYCLE = 5;
    private static final int MAX_MISSING_RESULT_ATTEMPTS = 5;
    private static final long AUTH_PAUSE_MS = 5L * 60 * 1000;
    private static final int AUTH_RETRIES = 3;
    private static final int BAD_REQUEST_RETRIES = 2;

    private final BridgeApi api;
    private final KeyStore store;
    private final CommandPolicy policy;
    private final MainThread main;
    private final CommandRunner runner;
    private final Scheduler scheduler;
    private final LongSupplier clock;
    private final DoubleSupplier random;
    private final Logger logger;
    private final int maxPerClaim;

    private final Object outboxLock = new Object();
    private final ArrayDeque<AckItem> outbox = new ArrayDeque<>();
    private final AtomicInteger inFlight = new AtomicInteger();
    private final Map<String, Job> pendingStart = new ConcurrentHashMap<>();
    private volatile boolean stopped;

    // Состояние потока ввода-вывода.
    private Scheduler.Cancellable timer;
    private long nextClaimAt;
    private int failStreak;
    private int authStreak;
    private int badRequestStreak;
    private boolean storeWarned;
    /** Единый для ack и claim момент, раньше которого запросов к сайту нет (бэкофф и Retry-After). 0: нет ограничения. */
    private volatile long nextAttemptAt;
    /** Длинная пауза (401 подряд, отказ сайта): только для отображения в status; гейт запросов тоже учитывает её. */
    private volatile long pausedUntil;
    private volatile String last = "ещё не опрашивал";

    DeliveryEngine(BridgeApi api, KeyStore store, CommandPolicy policy, MainThread main, CommandRunner runner,
                   Scheduler scheduler, LongSupplier clockMillis, DoubleSupplier random, Logger logger, int maxPerClaim) {
        this.api = api;
        this.store = store;
        this.policy = policy;
        this.main = main;
        this.runner = runner;
        this.scheduler = scheduler;
        this.clock = clockMillis;
        this.random = random;
        this.logger = logger;
        this.maxPerClaim = maxPerClaim;
    }

    void start(long initialDelayMs) {
        arm(initialDelayMs);
    }

    Status status() {
        int ob;
        synchronized (outboxLock) {
            ob = outbox.size();
        }
        long pause = Math.max(0, pausedUntil - clock.getAsLong());
        return new Status(store.healthy(), store.size(), ob, inFlight.get(), pause, last);
    }

    // ---- цикл на потоке ввода-вывода ----

    private synchronized void arm(long delayMs) {
        if (stopped) return;
        if (timer != null) timer.cancel();
        timer = scheduler.schedule(delayMs, this::cycle);
    }

    /**
     * Просит цикл выполниться немедленно (например, чтобы сразу отправить ack). Цикл всё равно проходит через гейт
     * {@code nextAttemptAt}/{@code pausedUntil} в {@link #step()}: бэкофф и Retry-After после 429/503 не обходятся,
     * при закрытом гейте цикл лишь заново ставит таймер на остаток времени.
     */
    private void kick() {
        if (!stopped) scheduler.execute(this::cycle);
    }

    /** Один проход цикла. Package-private для тестов. */
    void cycle() {
        if (stopped) return;
        long delay;
        try {
            delay = step();
        } catch (Throwable t) {
            failStreak++;
            logger.warning("Сбой цикла выдачи: " + t.getClass().getSimpleName());
            delay = backoff(clock.getAsLong(), Backoff.delayMs(failStreak, null, random));
        }
        arm(delay);
    }

    /** Закрывает гейт запросов к сайту на delay мс от now и возвращает delay. */
    private long backoff(long now, long delay) {
        nextAttemptAt = now + delay;
        return delay;
    }

    private long step() {
        long now = clock.getAsLong();
        dropExpiredAcks(now);
        long gate = Math.max(pausedUntil, nextAttemptAt);
        if (now < gate) {
            return gate - now; // единый гейт для ack и claim, в том числе при kick()
        }
        // 1. Сначала подтверждаем уже выполненное.
        for (int i = 0; i < MAX_ACK_BATCHES_PER_CYCLE && outboxSize() > 0; i++) {
            List<AckItem> batch = peekBatch();
            BridgeApi.Result<List<AckResult>> r = api.ack(batch);
            if (r.kind() == BridgeApi.Kind.OK) {
                authStreak = 0;
                if (applyAck(batch, r.value())) {
                    resetStreaks();
                } else {
                    // Сайт не вернул итог по части заданий (или статус незнакомый): повтор только после бэкоффа.
                    failStreak++;
                    last = "ack: неполный ответ сайта";
                    return backoff(now, Backoff.delayMs(failStreak, r.retryAfterSeconds(), random));
                }
            } else {
                return onFailure("ack", r, batch);
            }
        }
        if (outboxSize() > 0) {
            return 250;
        }
        // 2. Новый claim только когда ничего не висит в работе.
        if (inFlight.get() > 0) {
            return 1_000;
        }
        if (!store.healthy()) {
            if (!storeWarned) {
                logger.severe(store.corruptionPending()
                        ? "Журнал ключей повреждён: опрос заданий остановлен до подтверждения оператором "
                                + "(/twomcbridge ackcorrupt), иначе возможна двойная выдача."
                        : "Журнал ключей недоступен: опрос заданий остановлен до перезапуска (иначе возможна двойная выдача).");
                storeWarned = true;
            }
            last = store.corruptionPending() ? "журнал повреждён, нужен /twomcbridge ackcorrupt" : "журнал ключей недоступен";
            return 30_000;
        }
        storeWarned = false;
        if (now < nextClaimAt) {
            return nextClaimAt - now;
        }
        BridgeApi.Result<ClaimResponse> r = api.claim(maxPerClaim);
        if (r.kind() != BridgeApi.Kind.OK) {
            return onFailure("claim", r, null);
        }
        resetStreaks();
        ClaimResponse c = r.value();
        nextClaimAt = clock.getAsLong() + c.pollAfterMs(); // «не опрашивать чаще pollAfterMs»
        last = "claim: заданий " + c.jobs().size() + (c.skipped() > 0 ? ", пропущено нечитаемых " + c.skipped() : "");
        if (c.skipped() > 0) {
            logger.warning("Ответ claim содержит нечитаемые задания: " + c.skipped() + " (пропущены, закроет сайт по таймауту).");
        }
        scheduleJobs(c.jobs());
        return c.pollAfterMs();
    }

    private void resetStreaks() {
        failStreak = 0;
        authStreak = 0;
        badRequestStreak = 0;
        nextAttemptAt = 0;
    }

    private long onFailure(String op, BridgeApi.Result<?> r, List<AckItem> ackBatch) {
        long now = clock.getAsLong();
        switch (r.kind()) {
            case AUTH -> {
                authStreak++;
                last = op + ": 401";
                logSkew(r.dateHeader(), now);
                if (authStreak > AUTH_RETRIES) {
                    authStreak = 0;
                    pausedUntil = now + AUTH_PAUSE_MS;
                    logger.severe("Сайт отвечает 401 на " + op + " (подпись, ключ, время или nonce). Пауза 5 минут. "
                            + "Проверьте keyId, секрет и часы сервера (NTP).");
                    return AUTH_PAUSE_MS;
                }
                logger.warning("Сайт отвечает 401 на " + op + " (попытка " + authStreak + " из " + AUTH_RETRIES + ").");
                return backoff(now, Backoff.delayMs(authStreak, null, random));
            }
            case RETRYABLE -> {
                failStreak++;
                last = op + ": " + (r.status() == 0 ? r.errorCode() : "HTTP " + r.status());
                if (failStreak == 1 || failStreak % 10 == 0) {
                    logger.warning("Сайт недоступен для " + op + " (" + last + "), повтор позже; подряд неудач: " + failStreak);
                }
                return backoff(now, Backoff.delayMs(failStreak, r.retryAfterSeconds(), random));
            }
            default -> {
                last = op + ": HTTP " + r.status() + (r.errorCode() != null ? " " + r.errorCode() : "");
                logger.severe("Сайт отверг " + op + ": HTTP " + r.status() + (r.errorCode() != null ? " " + r.errorCode() : "")
                        + (r.status() == 403 ? " (у сервера нет возможности delivery на сайте)" : "") + ".");
                if (ackBatch != null && (r.status() == 400 || r.status() == 422)) {
                    // 400 может быть и временным (сбой прокси, гонка на сайте): два повтора с короткой паузой, затем
                    // сайт признал пачку негодной. Ключи в журнале остаются, сайт закроет задания по таймауту как UNKNOWN.
                    badRequestStreak++;
                    if (badRequestStreak <= BAD_REQUEST_RETRIES) {
                        logger.warning("Ack отвергнут (HTTP " + r.status() + "), повтор " + badRequestStreak + " из " + BAD_REQUEST_RETRIES + ".");
                        return backoff(now, 1_000L * badRequestStreak);
                    }
                    badRequestStreak = 0;
                    removeFromOutbox(ackBatch);
                    logger.severe("Пачка ack отброшена (" + ackBatch.size() + "). Исход заданий разберёт администратор на сайте.");
                    return 1_000;
                }
                // 403/404/3xx/413 и прочее на ack: причина, скорее всего, в настройке сайта, прокси или версии (а не в
                // самих заданиях). Очередь ack СОХРАНЯЕТСЯ, пауза и повтор; по таймауту сайт всё равно закроет задания,
                // а старше 24 часов ack отбрасываются (dropExpiredAcks).
                if (ackBatch != null) {
                    logger.severe("Очередь ack сохранена (" + outboxSize() + "), пауза 5 минут, затем повтор.");
                }
                pausedUntil = now + AUTH_PAUSE_MS;
                return AUTH_PAUSE_MS;
            }
        }
    }

    private void logSkew(String dateHeader, long nowMs) {
        if (dateHeader == null) return;
        try {
            long serverMs = ZonedDateTime.parse(dateHeader, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli();
            long skewSec = (serverMs - nowMs) / 1000;
            if (Math.abs(skewSec) > 5) {
                logger.warning("Часы сервера расходятся с часами сайта примерно на " + skewSec + " с (допуск подписи 60 с).");
            }
        } catch (RuntimeException ignored) {
            // заголовок Date только для диагностики
        }
    }

    // ---- ack ----

    private int outboxSize() {
        synchronized (outboxLock) {
            return outbox.size();
        }
    }

    private List<AckItem> peekBatch() {
        synchronized (outboxLock) {
            List<AckItem> out = new ArrayList<>();
            for (AckItem it : outbox) {
                if (out.size() >= Protocol.ACK_MAX_ITEMS) break;
                out.add(it);
            }
            return out;
        }
    }

    private void removeFromOutbox(List<AckItem> items) {
        Set<AckItem> set = java.util.Collections.newSetFromMap(new IdentityHashMap<>());
        set.addAll(items);
        synchronized (outboxLock) {
            outbox.removeIf(set::contains);
        }
    }

    /** Package-private для тестов пакетной отправки. */
    void enqueueAck(Job job, AckStatus status, String code) {
        AckItem item = new AckItem(job.jobId(), job.claimToken(), status, code, clock.getAsLong());
        synchronized (outboxLock) {
            outbox.addLast(item);
        }
    }

    /** @return true, если по каждому заданию пачки получен окончательный итог (в очереди ничего не осталось от пачки). */
    private boolean applyAck(List<AckItem> batch, List<AckResult> results) {
        Map<String, AckResult> byId = new HashMap<>();
        for (AckResult r : results) byId.put(r.jobId(), r);
        List<AckItem> done = new ArrayList<>();
        for (AckItem it : batch) {
            AckResult r = byId.get(it.jobId);
            if (r == null) {
                it.attempts++;
                if (it.attempts >= MAX_MISSING_RESULT_ATTEMPTS) {
                    logger.warning("Сайт не вернул результат ack для задания " + it.jobId + " после " + it.attempts + " попыток; отброшено.");
                    done.add(it);
                }
            } else if (r.status().equals("accepted") || r.status().equals("duplicate")) {
                done.add(it);
            } else if (r.status().equals("rejected")) {
                // unknown_job, token_mismatch, not_claimed, conflict: повтор того же не поможет.
                logger.warning("Сайт отклонил ack: задание " + it.jobId + ", исход " + it.status.wire + ", код "
                        + (r.code() == null ? "-" : r.code()) + ". Разбор на сайте (/admin/store/delivery).");
                done.add(it);
            } else {
                it.attempts++; // незнакомый статус: оставляем, повторим
            }
        }
        removeFromOutbox(done);
        return done.size() == batch.size();
    }

    private void dropExpiredAcks(long now) {
        List<AckItem> old = new ArrayList<>();
        synchronized (outboxLock) {
            for (AckItem it : outbox) {
                if (now - it.createdAtMs > ACK_MAX_AGE_MS) old.add(it);
            }
        }
        if (!old.isEmpty()) {
            removeFromOutbox(old);
            logger.severe("Отброшено ack старше 24 часов: " + old.size() + ". Ключи остаются в журнале; исход разберёт администратор.");
        }
    }

    // ---- задания ----

    private void scheduleJobs(List<Job> jobs) {
        int index = 0;
        for (Job job : jobs) {
            if (index++ >= maxPerClaim) {
                enqueueAck(job, AckStatus.RETRY, Protocol.CODE_TOO_MANY); // сайт отдал больше запрошенного, не начинали
                continue;
            }
            inFlight.incrementAndGet();
            pendingStart.put(job.jobId(), job);
            try {
                main.run(() -> executeOnMain(job));
            } catch (RuntimeException e) {
                if (pendingStart.remove(job.jobId()) != null) {
                    inFlight.decrementAndGet();
                    enqueueAck(job, AckStatus.RETRY, Protocol.CODE_SHUTDOWN); // главный поток недоступен: не начинали
                }
            }
        }
    }

    /** Главный поток. Единственное место, где исполняется команда. */
    void executeOnMain(Job job) {
        if (pendingStart.remove(job.jobId()) == null) {
            return; // задание уже закрыто при остановке
        }
        try {
            AckItem item;
            try {
                item = decideAndRun(job);
            } catch (Throwable t) {
                logger.severe("Внутренняя ошибка при выдаче задания " + job.jobId() + ": " + t.getClass().getSimpleName());
                item = new AckItem(job.jobId(), job.claimToken(), AckStatus.UNKNOWN, "internal_error", clock.getAsLong());
            }
            synchronized (outboxLock) {
                outbox.addLast(item);
            }
        } finally {
            inFlight.decrementAndGet();
            kick(); // подтвердить сразу: сайт ждёт ack 10 секунд
        }
    }

    private AckItem ack(Job job, AckStatus status, String code) {
        return new AckItem(job.jobId(), job.claimToken(), status, code, clock.getAsLong());
    }

    private AckItem decideAndRun(Job job) {
        String key = job.idempotencyKey();
        if (key == null) {
            return ack(job, AckStatus.FAILED, Protocol.CODE_INVALID_JOB);
        }
        if (stopped) {
            return ack(job, AckStatus.RETRY, Protocol.CODE_SHUTDOWN); // команда не начиналась
        }
        // Проверка и запись ключа выполняются в главном потоке и потому не гоняются с другим заданием (R167).
        switch (store.state(key)) {
            case DONE -> {
                logger.info("Задание " + job.jobId() + ": ключ " + key + " уже выполнен, команда не повторяется, ответ done.");
                return ack(job, AckStatus.DONE, null);
            }
            case STARTED, UNKNOWN -> {
                logger.warning("Задание " + job.jobId() + ": ключ " + key + " имеет неизвестный исход, команда не повторяется (ответ unknown).");
                return ack(job, AckStatus.UNKNOWN, Protocol.CODE_OUTCOME_UNKNOWN);
            }
            default -> { }
        }
        String problem = policy.check(job.command());
        if (problem != null) {
            logger.warning("Задание " + job.jobId() + " отклонено локальной проверкой команды: " + problem + ".");
            return ack(job, AckStatus.FAILED, problem);
        }
        if (!store.begin(key)) {
            return ack(job, AckStatus.RETRY, Protocol.CODE_STORE_UNAVAILABLE); // запись не удалась, команда не выполнялась
        }
        boolean ok;
        try {
            ok = runner.dispatch(job.command());
        } catch (Throwable t) {
            store.finish(key, KeyStore.State.UNKNOWN);
            logger.severe("Задание " + job.jobId() + ": исключение при исполнении команды (" + t.getClass().getSimpleName()
                    + "), исход неизвестен.");
            return ack(job, AckStatus.UNKNOWN, Protocol.CODE_DISPATCH_EXCEPTION);
        }
        if (ok) {
            store.finish(key, KeyStore.State.DONE); // до отправки ack
            logger.info("Задание " + job.jobId() + " выполнено (ключ " + key + ").");
            return ack(job, AckStatus.DONE, null);
        }
        store.finish(key, KeyStore.State.FAILED);
        logger.warning("Задание " + job.jobId() + ": сервер отверг команду.");
        return ack(job, AckStatus.FAILED, Protocol.CODE_REJECTED);
    }

    // ---- остановка ----

    /** Вызывается из onDisable (главный поток). После остановки команды не исполняются. */
    void shutdown() {
        stopped = true;
        synchronized (this) {
            if (timer != null) timer.cancel();
        }
        // Всё, что не успело начаться, точно не выполнялось: возвращаем в повтор.
        for (String id : new ArrayList<>(pendingStart.keySet())) {
            Job j = pendingStart.remove(id);
            if (j != null) {
                inFlight.decrementAndGet();
                enqueueAck(j, AckStatus.RETRY, Protocol.CODE_SHUTDOWN);
            }
        }
        scheduler.runAndAwait(this::finalFlush, 8_000);
        scheduler.shutdown();
    }

    private void finalFlush() {
        for (int i = 0; i < 2 && outboxSize() > 0; i++) {
            List<AckItem> batch = peekBatch();
            BridgeApi.Result<List<AckResult>> r;
            try {
                r = api.ack(batch);
            } catch (RuntimeException e) {
                return;
            }
            if (r.kind() != BridgeApi.Kind.OK) {
                return; // не доставлено: сайт закроет по таймауту, ключи в журнале сохранены
            }
            applyAck(batch, r.value());
        }
    }
}
