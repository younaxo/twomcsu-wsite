package ru.twomc.giveaway;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/** Событие сессии. Не содержит IP и иных данных игрока кроме UUID и ника. */
public record GiveawayEvent(String eventId, Type type, UUID playerUuid, String playerName, long occurredAtMillis, Boolean active) {

    public enum Type {
        JOIN("join"), QUIT("quit"), HEARTBEAT("heartbeat");

        public final String wire;

        Type(String wire) {
            this.wire = wire;
        }

        static Type fromWire(String s) {
            for (Type t : values()) {
                if (t.wire.equals(s)) return t;
            }
            return null;
        }
    }

    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    public GiveawayEvent {
        if ((type == Type.HEARTBEAT) != (active != null)) {
            throw new IllegalArgumentException("active is required only for heartbeat");
        }
    }

    public static GiveawayEvent join(UUID uuid, String name, long nowMillis) {
        return new GiveawayEvent(UUID.randomUUID().toString(), Type.JOIN, uuid, name, nowMillis, null);
    }

    public static GiveawayEvent quit(UUID uuid, String name, long nowMillis) {
        return new GiveawayEvent(UUID.randomUUID().toString(), Type.QUIT, uuid, name, nowMillis, null);
    }

    public static GiveawayEvent heartbeat(UUID uuid, String name, long nowMillis, boolean active) {
        return new GiveawayEvent(UUID.randomUUID().toString(), Type.HEARTBEAT, uuid, name, nowMillis, active);
    }

    public static boolean isValidName(String name) {
        return name != null && Protocol.PLAYER_NAME.matcher(name).matches();
    }

    /** JSON одного события; ник заранее проверен, спецсимволов в нём нет. */
    public String toJson() {
        StringBuilder sb = new StringBuilder(220);
        sb.append("{\"eventId\":\"").append(eventId)
                .append("\",\"type\":\"").append(type.wire)
                .append("\",\"playerUuid\":\"").append(playerUuid)
                .append("\",\"playerName\":\"").append(playerName)
                .append("\",\"occurredAt\":\"").append(ISO_MILLIS.format(Instant.ofEpochMilli(occurredAtMillis))).append('"');
        if (active != null) {
            sb.append(",\"active\":").append(active.booleanValue());
        }
        return sb.append('}').toString();
    }

    /** Тело пакета. */
    public static String batchJson(List<GiveawayEvent> events) {
        StringBuilder sb = new StringBuilder(64 + events.size() * 220);
        sb.append("{\"schema\":\"").append(Protocol.SCHEMA).append("\",\"events\":[");
        for (int i = 0; i < events.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(events.get(i).toJson());
        }
        return sb.append("]}").toString();
    }

    /** Строка очереди: eventId TAB type TAB uuid TAB name TAB epochMilli TAB active(1/0/-). */
    public String toLine() {
        return eventId + '\t' + type.wire + '\t' + playerUuid + '\t' + playerName + '\t' + occurredAtMillis + '\t'
                + (active == null ? "-" : active ? "1" : "0");
    }

    /** @return событие или null, если строка повреждена. */
    public static GiveawayEvent fromLine(String line) {
        try {
            String[] p = line.split("\t", -1);
            if (p.length != 6) return null;
            Type type = Type.fromWire(p[1]);
            if (type == null) return null;
            UUID eventId = UUID.fromString(p[0]);
            UUID uuid = UUID.fromString(p[2]);
            if (!isValidName(p[3])) return null;
            long at = Long.parseLong(p[4]);
            Boolean active;
            switch (p[5]) {
                case "1" -> active = Boolean.TRUE;
                case "0" -> active = Boolean.FALSE;
                case "-" -> active = null;
                default -> {
                    return null;
                }
            }
            if ((type == Type.HEARTBEAT) != (active != null)) return null;
            return new GiveawayEvent(eventId.toString(), type, uuid, p[3], at, active);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
