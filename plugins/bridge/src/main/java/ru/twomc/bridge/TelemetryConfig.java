package ru.twomc.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Настройки снимков статистики и инвентаря. Оба по умолчанию ВЫКЛЮЧЕНЫ (включает владелец после того, как
 * на сайте выданы возможности player-events и inventory-sync и включены флаги приёма). Значения приводятся к
 * безопасным границам, а не отклоняются: неверное число не должно молча включать частые запросы.
 */
final class TelemetryConfig {
    /** Откуда брать «kills»: только убийства игроков либо игроки плюс мобы. */
    enum KillsMode { PLAYER, ALL }

    /** «hits» в ванильной статистике нет; по умолчанию метрика не шлётся. */
    enum HitsMode { OFF, DAMAGE_DEALT }

    static final int MIN_STATS_INTERVAL_MIN = 1;
    static final int MAX_INTERVAL_MIN = 24 * 60;
    static final long MIN_GAP_MS = 30_000L;

    final boolean statsEnabled;
    final long statsIntervalMs;
    final KillsMode killsMode;
    final HitsMode hitsMode;
    final boolean inventoryEnabled;
    final long inventoryIntervalMs;
    final long inventoryMinGapMs;
    final long inventoryHeartbeatMs;
    final List<String> warnings;

    private TelemetryConfig(boolean statsEnabled, long statsIntervalMs, KillsMode killsMode, HitsMode hitsMode,
                            boolean inventoryEnabled, long inventoryIntervalMs, long inventoryMinGapMs,
                            long inventoryHeartbeatMs, List<String> warnings) {
        this.statsEnabled = statsEnabled;
        this.statsIntervalMs = statsIntervalMs;
        this.killsMode = killsMode;
        this.hitsMode = hitsMode;
        this.inventoryEnabled = inventoryEnabled;
        this.inventoryIntervalMs = inventoryIntervalMs;
        this.inventoryMinGapMs = inventoryMinGapMs;
        this.inventoryHeartbeatMs = inventoryHeartbeatMs;
        this.warnings = warnings;
    }

    boolean anyEnabled() {
        return statsEnabled || inventoryEnabled;
    }

    static TelemetryConfig of(boolean statsEnabled, int statsIntervalMinutes, String kills, String hits,
                              boolean inventoryEnabled, int inventoryIntervalMinutes, int inventoryMinGapSeconds,
                              int inventoryHeartbeatMinutes) {
        List<String> w = new ArrayList<>();
        int sm = clamp("stats.intervalMinutes", statsIntervalMinutes, MIN_STATS_INTERVAL_MIN, MAX_INTERVAL_MIN, w);
        int im = clamp("inventory.intervalMinutes", inventoryIntervalMinutes, 1, MAX_INTERVAL_MIN, w);
        long gap = Math.max(MIN_GAP_MS, inventoryMinGapSeconds * 1000L);
        if (inventoryMinGapSeconds * 1000L < MIN_GAP_MS) {
            w.add("inventory.minGapSeconds меньше 30: применено 30 (контракт: не чаще раза в 30 с на игрока).");
        }
        long hb = Math.max((long) im * 60_000L, inventoryHeartbeatMinutes * 60_000L);
        KillsMode km = KillsMode.PLAYER;
        if ("all".equalsIgnoreCase(kills == null ? "" : kills.trim())) {
            km = KillsMode.ALL;
        } else if (kills != null && !kills.isBlank() && !"player".equalsIgnoreCase(kills.trim())) {
            w.add("stats.kills должен быть player или all: применено player.");
        }
        HitsMode hm = HitsMode.OFF;
        String h = hits == null ? "" : hits.trim().toLowerCase(Locale.ROOT).replace('_', '-');
        if (h.equals("damage-dealt")) {
            hm = HitsMode.DAMAGE_DEALT;
        } else if (!h.isEmpty() && !h.equals("off")) {
            w.add("stats.hits должен быть off или damage-dealt: применено off.");
        }
        return new TelemetryConfig(statsEnabled, sm * 60_000L, km, hm, inventoryEnabled, im * 60_000L, gap, hb, List.copyOf(w));
    }

    private static int clamp(String name, int v, int min, int max, List<String> warnings) {
        int c = Math.max(min, Math.min(max, v));
        if (c != v) warnings.add(name + "=" + v + " вне диапазона " + min + ".." + max + ": применено " + c + ".");
        return c;
    }

    @Override
    public String toString() {
        return "stats=" + (statsEnabled ? "включена каждые " + statsIntervalMs / 60_000 + " мин" : "выключена")
                + ", inventory=" + (inventoryEnabled ? "включён каждые " + inventoryIntervalMs / 60_000 + " мин" : "выключен");
    }
}
