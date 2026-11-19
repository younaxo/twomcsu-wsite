package ru.twomc.giveaway;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;
import java.util.logging.Logger;

/**
 * Отправка пакетов из очереди. Вызывается только из асинхронного потока (runOnce).
 * Удаление из очереди — только после 2xx; ошибки схемы (413/422) — в dead-letter;
 * 400 (может быть ответом прокси/WAF) — повтор с backoff, после MAX_CONSECUTIVE_400 подряд для одного пакета — dead-letter;
 * остальное (сеть, 401, 403, 429, 5xx) — повтор с экспоненциальной задержкой.
 * В ответе 200 учитывается поле rejected (счётчик и агрегат по причинам, без ников и UUID).
 */
public final class BatchSender {

    public interface Transport {
        Response post(URI uri, Map<String, String> headers, byte[] body) throws IOException, InterruptedException;
    }

    public record Response(int status, String retryAfter, String body) {
        public Response(int status, String retryAfter) { this(status, retryAfter, null); }
    }

    public enum Outcome { ACK, DEAD_LETTER, RETRY }

    static final long BACKOFF_BASE_MS = 10_000L;
    static final long BACKOFF_MAX_MS = 15 * 60_000L;
    static final long RETRY_AFTER_MAX_MS = 15 * 60_000L;
    static final int MAX_BATCHES_PER_RUN = 10;
    private static final long LOG_REPEAT_MS = 10 * 60_000L;
    static final int MAX_CONSECUTIVE_400 = 5;
    static final long REJECT_LOG_MS = 10 * 60_000L;
    private static final java.util.regex.Pattern REASON = java.util.regex.Pattern.compile("\"reason\"\\s*:\\s*\"([a-z_]{1,32})\"");

    private final EventQueue queue;
    private final SenderConfig config; // null, если не настроено
    private final Transport transport;
    private final LongSupplier clock;
    private final Logger log;
    private final java.util.function.DoubleSupplier jitter; // [0,1)

    private volatile int consecutiveFailures;
    private volatile long nextAttemptAt;
    private volatile long lastSuccessAt = -1;
    private volatile String lastError = "";
    private volatile long sentTotal;
    private volatile long lastLoggedAt;
    private volatile String lastLoggedError = "";
    private final java.util.concurrent.atomic.LongAdder rejectedTotal = new java.util.concurrent.atomic.LongAdder();
    private final java.util.concurrent.ConcurrentHashMap<String, Long> rejectedWindow = new java.util.concurrent.ConcurrentHashMap<>();
    private volatile long lastRejectLogAt;
    private String last400Key = "";
    private int consecutive400;

    public BatchSender(EventQueue queue, SenderConfig config, Transport transport, LongSupplier clock, Logger log,
                       java.util.function.DoubleSupplier jitter) {
        this.queue = queue;
        this.config = config;
        this.transport = transport;
        this.clock = clock;
        this.log = log;
        this.jitter = jitter;
    }

    public static Outcome classify(int status) {
        if (status >= 200 && status < 300) return Outcome.ACK;
        if (status == 413 || status == 422) return Outcome.DEAD_LETTER;
        return Outcome.RETRY;
    }

    /** Задержка перед следующей попыткой: base*2^(n-1), максимум 15 мин, ±20% разброс (jitter01 в [0,1)). */
    public static long backoffMillis(int failures, double jitter01) {
        int shift = Math.min(Math.max(failures - 1, 0), 20);
        long raw = Math.min(BACKOFF_BASE_MS << shift, BACKOFF_MAX_MS);
        double factor = 0.8 + 0.4 * jitter01;
        return Math.max(1_000L, (long) (raw * factor));
    }

    /** Retry-After в секундах (целое); иначе -1. Ограничивается 15 минутами. */
    public static long parseRetryAfterMillis(String header) {
        if (header == null) return -1;
        try {
            long s = Long.parseLong(header.trim());
            if (s < 0) return -1;
            return Math.min(s * 1000L, RETRY_AFTER_MAX_MS);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /** Один проход: сброс буфера на диск, отбрасывание старых, отправка пакетов, пока всё проходит. */
    public void runOnce() {
        queue.flush();
        long now = clock.getAsLong();
        long maxAge = Protocol.MAX_EVENT_AGE.toMillis() - Protocol.AGE_SAFETY_MARGIN.toMillis();
        int dropped = queue.purgeOlderThan(now, maxAge);
        if (dropped > 0) {
            log.warning("Отброшено событий старше 72 ч: " + dropped);
        }
        maybeLogRejected(now);
        if (config == null) return;
        if (now < nextAttemptAt) return;

        for (int i = 0; i < MAX_BATCHES_PER_RUN; i++) {
            List<GiveawayEvent> batch = queue.peek(Protocol.MAX_EVENTS_PER_BATCH);
            if (batch.isEmpty()) return;
            if (!sendBatch(batch)) return;
        }
    }

    /** @return true, если пакет подтверждён или отброшен и можно слать следующий. */
    private boolean sendBatch(List<GiveawayEvent> batch) {
        byte[] body = GiveawayEvent.batchJson(batch).getBytes(StandardCharsets.UTF_8);
        if (body.length > Protocol.MAX_BODY_BYTES) {
            queue.deadLetter(batch, "body_too_large");
            return true;
        }
        long now = clock.getAsLong();
        String timestamp = Long.toString(now / 1000L);
        String nonce = Signer.newNonce();
        String signature = Signer.sign(config.key(), config.keyId, timestamp, nonce, Protocol.METHOD, Protocol.SIGN_PATH, body);

        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put(Protocol.HEADER_KEY_ID, config.keyId);
        headers.put(Protocol.HEADER_TIMESTAMP, timestamp);
        headers.put(Protocol.HEADER_NONCE, nonce);
        headers.put(Protocol.HEADER_SIGNATURE, signature);

        Response resp;
        try {
            resp = transport.post(config.endpoint, headers, body);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (IOException | RuntimeException e) {
            fail("network:" + e.getClass().getSimpleName(), -1);
            return false;
        }

        if (resp.status() == 400) {
            String key = batch.get(0).eventId() + ":" + batch.size();
            consecutive400 = key.equals(last400Key) ? consecutive400 + 1 : 1;
            last400Key = key;
            if (consecutive400 >= MAX_CONSECUTIVE_400) {
                queue.deadLetter(batch, "http_400_x" + consecutive400);
                last400Key = "";
                consecutive400 = 0;
                consecutiveFailures = 0;
                nextAttemptAt = 0;
                lastError = "http 400 " + MAX_CONSECUTIVE_400 + " раз подряд (пакет отброшен в dead-letter)";
                log.warning("Сайт отвечает HTTP 400 на один и тот же пакет " + MAX_CONSECUTIVE_400 + " раз подряд, "
                        + batch.size() + " событий перенесено в dead-letter.log.");
                return true;
            }
            fail("http 400 (возможен ответ прокси/WAF, попытка " + consecutive400 + "/" + MAX_CONSECUTIVE_400 + ")", -1);
            return false;
        }
        last400Key = "";
        consecutive400 = 0;

        switch (classify(resp.status())) {
            case ACK -> {
                recordRejected(resp.body());
                queue.ack(batch);
                consecutiveFailures = 0;
                nextAttemptAt = 0;
                lastSuccessAt = clock.getAsLong();
                sentTotal += batch.size();
                if (!lastError.isEmpty()) {
                    log.info("Связь с сайтом восстановлена.");
                    lastError = "";
                    lastLoggedError = "";
                }
                return true;
            }
            case DEAD_LETTER -> {
                queue.deadLetter(batch, "http_" + resp.status());
                lastError = "http " + resp.status() + " (пакет отброшен в dead-letter)";
                log.warning("Сайт отклонил пакет (HTTP " + resp.status() + "), " + batch.size()
                        + " событий перенесено в dead-letter.log без повтора.");
                return true;
            }
            default -> {
                fail("http " + resp.status(), parseRetryAfterMillis(resp.retryAfter()));
                return false;
            }
        }
    }

    /** Причины из поля rejected ответа 200 (только счётчики по причинам, без eventId). */
    static Map<String, Integer> parseRejectedReasons(String body) {
        Map<String, Integer> out = new java.util.TreeMap<>();
        if (body == null) return out;
        int i = body.indexOf("\"rejected\"");
        if (i < 0) return out;
        java.util.regex.Matcher m = REASON.matcher(body);
        m.region(i, body.length());
        while (m.find()) out.merge(m.group(1), 1, Integer::sum);
        return out;
    }

    private void recordRejected(String body) {
        for (Map.Entry<String, Integer> e : parseRejectedReasons(body).entrySet()) {
            rejectedTotal.add(e.getValue());
            rejectedWindow.merge(e.getKey(), (long) e.getValue(), Long::sum);
        }
        maybeLogRejected(clock.getAsLong());
    }

    private void maybeLogRejected(long now) {
        if (rejectedWindow.isEmpty() || now - lastRejectLogAt < REJECT_LOG_MS) return;
        lastRejectLogAt = now;
        Map<String, Long> snap = new java.util.TreeMap<>(rejectedWindow);
        rejectedWindow.clear();
        StringBuilder sb = new StringBuilder("Сайт принял пакеты, но отклонил события (rejected):");
        for (Map.Entry<String, Long> e : snap.entrySet()) sb.append(' ').append(e.getKey()).append('=').append(e.getValue());
        if (snap.containsKey("in_future")) sb.append(". in_future: проверьте синхронизацию времени сервера (NTP)");
        if (snap.containsKey("too_old")) sb.append(". too_old: события старше 72 ч");
        log.warning(sb.toString());
    }

    private void fail(String code, long retryAfterMs) {
        int n = consecutiveFailures + 1;
        consecutiveFailures = n;
        long delay = Math.max(backoffMillis(n, jitter.getAsDouble()), retryAfterMs);
        long now = clock.getAsLong();
        nextAttemptAt = now + delay;
        lastError = code;
        if (!code.equals(lastLoggedError) || now - lastLoggedAt > LOG_REPEAT_MS) {
            lastLoggedError = code;
            lastLoggedAt = now;
            log.warning("Отправка не удалась (" + code + "), повтор через " + (delay / 1000) + " с. События сохранены в очереди.");
        }
    }

    public boolean configured() { return config != null; }
    public int consecutiveFailures() { return consecutiveFailures; }
    public long nextAttemptAt() { return nextAttemptAt; }
    public long lastSuccessAt() { return lastSuccessAt; }
    public String lastError() { return lastError; }
    public long sentTotal() { return sentTotal; }
    public long rejectedTotal() { return rejectedTotal.sum(); }
}
