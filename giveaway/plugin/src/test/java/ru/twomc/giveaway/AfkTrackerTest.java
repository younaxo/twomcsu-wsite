package ru.twomc.giveaway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class AfkTrackerTest {
    private static final long MIN = 60_000L;
    private final UUID p = UUID.randomUUID();

    @Test
    void unknownPlayerIsAfk() {
        assertFalse(new AfkTracker(5 * MIN).isActive(p, 1000));
    }

    @Test
    void activeJustBeforeThresholdAfkAtThreshold() {
        AfkTracker t = new AfkTracker(5 * MIN);
        t.touch(p, 0);
        assertTrue(t.isActive(p, 5 * MIN - 1));
        assertFalse(t.isActive(p, 5 * MIN));
        assertFalse(t.isActive(p, 30 * MIN));
    }

    @Test
    void activityResetsTimer() {
        AfkTracker t = new AfkTracker(5 * MIN);
        t.touch(p, 0);
        t.touch(p, 4 * MIN);
        assertTrue(t.isActive(p, 8 * MIN));
        assertFalse(t.isActive(p, 9 * MIN));
    }

    @Test
    void olderTouchDoesNotRewindActivity() {
        AfkTracker t = new AfkTracker(5 * MIN);
        t.touch(p, 10 * MIN);
        t.touch(p, 2 * MIN);
        assertTrue(t.isActive(p, 14 * MIN));
    }

    @Test
    void removeForgetsPlayer() {
        AfkTracker t = new AfkTracker(5 * MIN);
        t.touch(p, 0);
        t.remove(p);
        assertEquals(0, t.tracked());
        assertFalse(t.isActive(p, 1));
    }

    @Test
    void movementRules() {
        assertFalse(AfkTracker.isMeaningfulMove(1, 64, 1, 10f, 5f, 1, 64, 1, 10f, 5f));
        assertTrue(AfkTracker.isMeaningfulMove(1, 64, 1, 10f, 5f, 2, 64, 1, 10f, 5f));
        assertTrue(AfkTracker.isMeaningfulMove(1, 64, 1, 10f, 5f, 1, 65, 1, 10f, 5f));
        assertTrue(AfkTracker.isMeaningfulMove(1, 64, 1, 10f, 5f, 1, 64, 1, 11f, 5f));
        assertTrue(AfkTracker.isMeaningfulMove(1, 64, 1, 10f, 5f, 1, 64, 1, 10f, 6f));
    }
}
