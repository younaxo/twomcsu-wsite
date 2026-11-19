package ru.twomc.giveaway;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class MinuteBucketTest {
    @Test
    void firesOncePerRealMinuteEvenWithLaggyChecks() {
        MinuteBucket b = new MinuteBucket();
        assertTrue(b.advance(60_000L));
        assertFalse(b.advance(65_000L));
        assertFalse(b.advance(119_999L));
        assertTrue(b.advance(180_500L)); // лаг: минута пропущена целиком, но срабатывание одно
        assertFalse(b.advance(181_000L));
    }
}
