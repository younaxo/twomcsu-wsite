package ru.twomc.giveaway;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Служебные настройки фазы 2: константы в коде, необязательный override через переменные окружения
 * (GIVEAWAY_COOLDOWN_SECONDS, GIVEAWAY_PROGRESS_ENABLED, GIVEAWAY_PROGRESS_NOTIFY). В config.yml их нет.
 */
public record ServiceSettings(int cooldownSeconds, boolean progressEnabled, boolean notifyEnabled) {
    public static final int DEFAULT_COOLDOWN_SECONDS = 5;

    /** Ключи старого config.yml: дату, порог и служебные значения теперь задаёт сайт или код. Игнорируются. */
    public static final List<String> LEGACY_KEYS = List.of("thresholdHoursDefault", "thresholdMinutes", "startAt", "startText",
            "cutoffAt", "cutoffText", "cooldownSeconds", "progress");

    public static ServiceSettings resolve(Map<String, String> env) {
        int cd = DEFAULT_COOLDOWN_SECONDS;
        String raw = env.get("GIVEAWAY_COOLDOWN_SECONDS");
        if (raw != null && !raw.isBlank()) {
            try {
                cd = Math.max(1, Math.min(60, Integer.parseInt(raw.trim())));
            } catch (NumberFormatException ignored) {
                // остаётся значение по умолчанию
            }
        }
        return new ServiceSettings(cd, flag(env.get("GIVEAWAY_PROGRESS_ENABLED")), flag(env.get("GIVEAWAY_PROGRESS_NOTIFY")));
    }

    /** Какие устаревшие ключи есть в конфиге сервера (в порядке LEGACY_KEYS). */
    public static List<String> legacyKeysPresent(Set<String> keys) {
        List<String> found = new ArrayList<>();
        for (String k : LEGACY_KEYS) if (keys.contains(k)) found.add(k);
        return found;
    }

    private static boolean flag(String v) {
        return v == null || v.isBlank() || !(v.trim().equalsIgnoreCase("false") || v.trim().equals("0"));
    }
}
