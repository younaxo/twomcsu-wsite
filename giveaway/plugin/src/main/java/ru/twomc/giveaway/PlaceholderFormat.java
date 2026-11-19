package ru.twomc.giveaway;

import java.util.Locale;

/**
 * Значения плейсхолдеров %twomcgiveaway_*%. Чистые функции без Bukkit и PlaceholderAPI.
 * Даты и порог берутся только из ответа сайта (SiteInfo); пока ответа не было, они показываются как «—».
 * Без данных игрока возвращаются нули, «нет» и «-» вместо билета.
 * Ключи: hours, minutes, remaining, percent, qualified, ticket, threshold_hours, start, cutoff.
 */
public final class PlaceholderFormat {
    private PlaceholderFormat() {}

    public static final String YES = "да";
    public static final String NO = "нет";
    public static final String NO_TICKET = "-";
    public static final String UNKNOWN = "—";

    /** @param site последний ответ сайта или null; @return строка либо null для неизвестного ключа. */
    public static String resolve(String key, PlayerProgress p, SiteInfo site) {
        long threshold = p != null ? p.thresholdMinutes() : site != null ? site.thresholdMinutes() : 0;
        switch (key.toLowerCase(Locale.ROOT)) {
            case "hours": return Long.toString(p == null ? 0 : p.minutes() / 60);
            case "minutes": return Long.toString(p == null ? 0 : p.minutes() % 60);
            case "remaining": return p != null ? clock(p.remainingMinutes()) : threshold > 0 ? clock(threshold) : UNKNOWN;
            case "percent": return Integer.toString(p == null ? 0 : p.percent());
            case "qualified": return p != null && p.qualified() ? YES : NO;
            case "ticket": return p == null || p.ticket() == null ? NO_TICKET : p.ticket();
            case "threshold_hours": return threshold > 0 ? hours(threshold) : UNKNOWN;
            case "start": return or(site == null ? null : site.startText());
            case "cutoff": return or(site == null ? null : site.cutoffText());
            default: return null;
        }
    }

    private static String or(String s) {
        return s == null || s.isBlank() ? UNKNOWN : s;
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
