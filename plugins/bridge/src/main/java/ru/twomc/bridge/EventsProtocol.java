package ru.twomc.bridge;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Конверт POST /bridge/v1/events (контракт 3.1) и разбор ответа (5.1). Только то, что нужно снимкам. */
final class EventsProtocol {
    static final String SCHEMA = "twomc.bridge.v1";
    static final String TYPE_STATS = "player.stats.snapshot";
    static final String TYPE_INVENTORY = "inventory.snapshot";
    /** Лимит приёмника на `data` одного события (5.4): 16 КБ. */
    static final int MAX_EVENT_DATA_BYTES = 16384;
    /** Лимит приёмника на тело запроса: 256 КБ; берём запас. */
    static final int MAX_BODY_BYTES = 200 * 1024;
    static final int MAX_EVENTS_PER_BATCH = 20;

    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private EventsProtocol() {}

    /** Событие, уже получившее eventId и seq. {@code dataJson} - готовый JSON объекта data. */
    record OutEvent(String eventId, String type, long seq, long occurredAtMs, String dataJson) {}

    record EventResult(String eventId, String status, String code) {}

    /** ISO 8601 UTC с миллисекундами; ровно то, что даёт Date.toISOString() на сайте. */
    static String iso(long ms) {
        return ISO.format(Instant.ofEpochMilli(ms));
    }

    /** serverId протокола = часть key-id до точки. */
    static String serverIdOf(String keyId) {
        int dot = keyId.indexOf('.');
        return dot < 0 ? keyId : keyId.substring(0, dot);
    }

    static byte[] body(String serverId, String streamId, long sentAtMs, List<OutEvent> events) {
        StringBuilder sb = new StringBuilder(256);
        sb.append("{\"schema\":\"").append(SCHEMA).append("\",\"sentAt\":\"").append(iso(sentAtMs)).append("\",\"events\":[");
        for (int i = 0; i < events.size(); i++) {
            OutEvent e = events.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"eventId\":").append(DeliveryProtocol.quote(e.eventId()))
                    .append(",\"type\":").append(DeliveryProtocol.quote(e.type()))
                    .append(",\"serverId\":").append(DeliveryProtocol.quote(serverId))
                    .append(",\"streamId\":").append(DeliveryProtocol.quote(streamId))
                    .append(",\"seq\":").append(e.seq())
                    .append(",\"occurredAt\":\"").append(iso(e.occurredAtMs())).append('"')
                    .append(",\"data\":").append(e.dataJson()).append('}');
        }
        return sb.append("]}").toString().getBytes(StandardCharsets.UTF_8);
    }

    /** null, если тело не является ожидаемым JSON-объектом. */
    @SuppressWarnings("unchecked")
    static List<EventResult> parse(String body) {
        Map<String, Object> root = MiniJson.parseObject(body);
        if (root == null || !(root.get("results") instanceof List<?> list)) {
            return null;
        }
        List<EventResult> out = new ArrayList<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) {
                return null;
            }
            Map<String, Object> r = (Map<String, Object>) m;
            if (!(r.get("eventId") instanceof String id) || !(r.get("status") instanceof String st)) {
                return null;
            }
            out.add(new EventResult(id, st, r.get("code") instanceof String c ? c : null));
        }
        return out;
    }
}
