package ru.twomc.bridge;

/**
 * Накопленные итоги игрока (контракт 15.2). Копия значений Bukkit, снятая в главном потоке; без ссылок на сервер.
 * {@code null} в метрике означает «не присылать» (приёмник её не меняет).
 */
record StatsData(String uuid, Long playTimeMinutes, Long kills, Long deaths, Long hits) {
    /** Пределы приёмника (15.2). Значения выше предела обрезаются, чтобы событие не отклонили целиком. */
    static final long MAX_PLAY_MINUTES = 5_000_000L;
    static final long MAX_KILLS = 100_000_000L;
    static final long MAX_DEATHS = 100_000_000L;
    static final long MAX_HITS = 1_000_000_000L;

    boolean hasMetrics() {
        return playTimeMinutes != null || kills != null || deaths != null || hits != null;
    }

    /** JSON {@code data}: только uuid и metrics (имя игрока не шлём: сайт его не хранит). null, если метрик нет. */
    String toDataJson() {
        if (!hasMetrics()) return null;
        StringBuilder sb = new StringBuilder("{\"uuid\":").append(DeliveryProtocol.quote(uuid)).append(",\"metrics\":{");
        boolean first = true;
        first = put(sb, first, "playTimeMinutes", playTimeMinutes, MAX_PLAY_MINUTES);
        first = put(sb, first, "kills", kills, MAX_KILLS);
        first = put(sb, first, "deaths", deaths, MAX_DEATHS);
        put(sb, first, "hits", hits, MAX_HITS);
        return sb.append("}}").toString();
    }

    private static boolean put(StringBuilder sb, boolean first, String key, Long value, long max) {
        if (value == null) return first;
        long v = Math.max(0, Math.min(max, value));
        if (!first) sb.append(',');
        sb.append('"').append(key).append("\":").append(v);
        return false;
    }
}
