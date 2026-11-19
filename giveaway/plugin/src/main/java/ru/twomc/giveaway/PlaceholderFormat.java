package ru.twomc.giveaway;

import java.util.Locale;

/**
 * Значения плейсхолдеров %twomcgiveaway_*%. Чистые функции без Bukkit и PlaceholderAPI.
 * Без данных игрока (ещё не было опроса) возвращаются нули, «нет» и «-» вместо билета.
 * Ключи: hours, minutes, remaining, percent, qualified, ticket, threshold_hours, cutoff.
 */
public final class PlaceholderFormat {
    private PlaceholderFormat() {}

    public static final String YES = "да";
    public static final String NO = "нет";
    public static final String NO_TICKET = "-";

    /** @return строка либо null для неизвестного ключа. */
    public static String resolve(String key, PlayerProgress p, long defaultThresholdMinutes, String cutoffText) {
        long threshold = p != null ? p.thresholdMinutes() : defaultThresholdMinutes;
        switch (key.toLowerCase(Locale.ROOT)) {
            case "hours": return Long.toString(p == null ? 0 : p.minutes() / 60);
            case "minutes": return Long.toString(p == null ? 0 : p.minutes() % 60);
            case "remaining": return clock(p == null ? threshold : p.remainingMinutes());
            case "percent": return Integer.toString(p == null ? 0 : p.percent());
            case "qualified": return p != null && p.qualified() ? YES : NO;
            case "ticket": return p == null || p.ticket() == null ? NO_TICKET : p.ticket();
            case "threshold_hours": return hours(threshold);
            case "cutoff": return cutoffText == null ? "" : cutoffText;
            default: return null;
        }
    }

    /** «ч:мм», часы без ограничения сверху: 2880 -> 48:00, 5 -> 0:05. */
    public static String clock(long minutes) {
        long m = Math.max(0, minutes);
        return (m / 60) + ":" + String.format(Locale.ROOT, "%02d", m % 60);
    }

    /** Часы порога: целое, если делится нацело, иначе с одним знаком (3030 -> 50.5). */
    public static String hours(long minutes) {
        if (minutes % 60 == 0) return Long.toString(minutes / 60);
        return String.format(Locale.ROOT, "%.1f", minutes / 60.0);
    }
}
