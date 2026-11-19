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
 * Удаление из очереди — только после 2xx; ошибки схемы (400/413/422) — в dead-letter;
 * остальное (сеть, 401, 403, 429, 5xx) — повтор с экспоненциальной задержкой.
 */
public final class BatchSender {

    public interface Transport {
        Response post(URI uri, Map<String, String> headers, byte[] body) throws IOException, InterruptedException;
    }

    public record Response(int status, String retryAfter) {}

    public enum Outcome { ACK, DEAD_LETTER, RETRY }

    static final long BACKOFF_BASE_MS = 10_000L;
    static final long BACKOFF_MAX_MS = 15 * 60_000L;
    static final long RETRY_AFTER_MAX_MS = 15 * 60_000L;
    static final int MAX_BATCHES_PER_RUN = 10;
    private static final long LOG_REPEAT_MS = 10 * 60_000L;

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
        if (status == 400 || status == 413 || status == 422) return Outcome.DEAD_LETTER;
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

        switch (classify(resp.status())) {
            case ACK -> {
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
}
