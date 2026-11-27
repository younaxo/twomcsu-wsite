package ru.twomc.bridge;

import java.util.function.DoubleSupplier;

/** Задержки повтора: экспоненциальный бэкофф с джиттером, Retry-After сайта не обходится. */
final class Backoff {
    static final long BASE_MS = 2_000;
    static final long MAX_MS = 300_000;
    static final long MAX_RETRY_AFTER_S = 300;

    private Backoff() {}

    /**
     * @param attempt номер подряд неудачной попытки, с 1
     * @param retryAfterSeconds значение заголовка Retry-After или null
     */
    static long delayMs(int attempt, Long retryAfterSeconds, DoubleSupplier random) {
        if (retryAfterSeconds != null && retryAfterSeconds > 0) {
            long ra = Math.min(retryAfterSeconds, MAX_RETRY_AFTER_S) * 1000L;
            return ra + (long) (ra * 0.1 * random.getAsDouble()); // не раньше, чем просит сайт
        }
        int shift = Math.max(0, Math.min(attempt - 1, 8));
        long base = Math.min(MAX_MS, BASE_MS << shift);
        return (long) (base * (0.8 + 0.4 * random.getAsDouble()));
    }

    /** Разбор Retry-After в секундах (дата HTTP не поддерживается: сайт отдаёт секунды). */
    static Long parseRetryAfter(String header) {
        if (header == null) {
            return null;
        }
        try {
            long v = Long.parseLong(header.trim());
            return v > 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
