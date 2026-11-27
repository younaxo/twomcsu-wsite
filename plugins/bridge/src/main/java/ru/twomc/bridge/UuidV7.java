package ru.twomc.bridge;

import java.security.SecureRandom;
import java.util.function.LongSupplier;

/**
 * UUIDv7 для eventId (контракт 3.1: «UUIDv7 или ULID», 26-64 символа; UUID с дефисами занимает 36).
 * 48 бит времени в мс, версия 7, вариант 10, остальное случайное.
 */
final class UuidV7 {
    private static final SecureRandom RANDOM = new SecureRandom();

    private UuidV7() {}

    static String generate(long unixMs, LongSupplier randomA, LongSupplier randomB) {
        long hi = ((unixMs & 0xFFFFFFFFFFFFL) << 16) | 0x7000L | (randomA.getAsLong() & 0x0FFFL);
        long lo = (randomB.getAsLong() & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
        return hex(hi >>> 32, 8) + "-" + hex((hi >>> 16) & 0xFFFF, 4) + "-" + hex(hi & 0xFFFF, 4) + "-"
                + hex(lo >>> 48, 4) + "-" + hex(lo & 0xFFFFFFFFFFFFL, 12);
    }

    static String generate(long unixMs) {
        return generate(unixMs, RANDOM::nextLong, RANDOM::nextLong);
    }

    private static String hex(long v, int digits) {
        String s = Long.toHexString(v);
        return "0".repeat(Math.max(0, digits - s.length())) + s;
    }
}
