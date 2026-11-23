package ru.twomc.giveaway;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Прогресс одного игрока из ответа POST /progress (ADR-G002 п. 6.2). ticket == null, если билета нет. */
public record PlayerProgress(UUID uuid, long minutes, long thresholdMinutes, long remainingMinutes,
                             int percent, boolean qualified, String ticket) {

    /** Разбор ответа; битые записи пропускаются, при неверном корне или статусе != 200 возвращается пустая карта. */
    @SuppressWarnings("unchecked")
    public static Map<UUID, PlayerProgress> parse(int httpStatus, String body) {
        Map<UUID, PlayerProgress> out = new HashMap<>();
        if (httpStatus != 200) return out;
        Map<String, Object> root = MiniJson.parseObject(body);
        if (root == null || !(root.get("players") instanceof List<?> list)) return out;
        for (Object item : new ArrayList<>(list)) {
            if (!(item instanceof Map<?, ?> m)) continue;
            Map<String, Object> o = (Map<String, Object>) m;
            try {
                if (!(o.get("playerUuid") instanceof String u)) continue;
                long min = RedeemResult.num(o.get("minutes"));
                long th = RedeemResult.num(o.get("thresholdMinutes"));
                long rem = RedeemResult.num(o.get("remainingMinutes"));
                long pct = RedeemResult.num(o.get("percent"));
                if (min < 0 || th <= 0 || rem < 0 || pct < 0 || !(o.get("qualified") instanceof Boolean q)) continue;
                String ticket = o.get("ticket") instanceof String t && Protocol.TICKET.matcher(t).matches() ? t : null;
                UUID id = UUID.fromString(u);
                out.put(id, new PlayerProgress(id, min, th, rem, (int) Math.min(100, pct), q, ticket));
            } catch (IllegalArgumentException ignored) {
                // битый UUID: запись пропускается
            }
        }
        return out;
    }
}
