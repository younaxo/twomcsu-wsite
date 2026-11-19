package ru.twomc.giveaway;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Учёт последней активности игроков. Потокобезопасен (чат приходит асинхронно);
 * touch() — одна запись в ConcurrentHashMap. Время передаётся снаружи,
 * поэтому логика проверяется без сервера.
 */
public final class AfkTracker {
    private final ConcurrentHashMap<UUID, Long> lastActivity = new ConcurrentHashMap<>();
    private final long thresholdMillis;

    public AfkTracker(long thresholdMillis) {
        if (thresholdMillis <= 0) throw new IllegalArgumentException("threshold");
        this.thresholdMillis = thresholdMillis;
    }

    public void touch(UUID player, long nowMillis) {
        lastActivity.merge(player, nowMillis, Math::max);
    }

    public void remove(UUID player) {
        lastActivity.remove(player);
    }

    /** Активен, если последняя активность была менее порога назад. Неизвестный игрок считается AFK. */
    public boolean isActive(UUID player, long nowMillis) {
        Long last = lastActivity.get(player);
        return last != null && nowMillis - last < thresholdMillis;
    }

    public int tracked() {
        return lastActivity.size();
    }

    /** Смена блока или поворот головы; дрожание позиции внутри блока активностью не считается. */
    public static boolean isMeaningfulMove(int fromBx, int fromBy, int fromBz, float fromYaw, float fromPitch,
                                           int toBx, int toBy, int toBz, float toYaw, float toPitch) {
        return fromBx != toBx || fromBy != toBy || fromBz != toBz
                || fromYaw != toYaw || fromPitch != toPitch;
    }
}
