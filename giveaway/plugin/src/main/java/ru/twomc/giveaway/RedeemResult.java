package ru.twomc.giveaway;

import java.util.Map;

/** Разобранный ответ POST /redeem (ADR-G002 п. 6.1). Любой неожиданный ответ превращается в RETRY_LATER. */
public record RedeemResult(Kind kind, String ticket, long minutes, long remainingMinutes, long thresholdMinutes) {
    public enum Kind { ISSUED, REPEAT, NOT_ENOUGH, INVALID_CODE, NOT_STARTED, CLOSED, RETRY_LATER }

    public static final RedeemResult RETRY = new RedeemResult(Kind.RETRY_LATER, null, 0, 0, 0);

    /** @param httpStatus статус HTTP; любой кроме 200 (401/403/422/429/503/сеть) даёт RETRY_LATER. */
    public static RedeemResult parse(int httpStatus, String body) {
        if (httpStatus != 200) return RETRY;
        Map<String, Object> o = MiniJson.parseObject(body);
        if (o == null || !(o.get("status") instanceof String status)) return RETRY;
        switch (status) {
            case "issued": {
                if (!(o.get("ticket") instanceof String t) || !Protocol.TICKET.matcher(t).matches()) return RETRY;
                return new RedeemResult(Boolean.TRUE.equals(o.get("repeat")) ? Kind.REPEAT : Kind.ISSUED, t, 0, 0, 0);
            }
            case "not_enough": {
                long m = num(o.get("minutes")), r = num(o.get("remainingMinutes")), th = num(o.get("thresholdMinutes"));
                if (m < 0 || r < 0 || th <= 0) return RETRY;
                return new RedeemResult(Kind.NOT_ENOUGH, null, m, r, th);
            }
            case "invalid_code": return new RedeemResult(Kind.INVALID_CODE, null, 0, 0, 0);
            case "not_started": return new RedeemResult(Kind.NOT_STARTED, null, 0, 0, 0);
            case "closed": return new RedeemResult(Kind.CLOSED, null, 0, 0, 0);
            default: return RETRY;
        }
    }

    static long num(Object v) {
        return v instanceof Long l ? l : v instanceof Double d ? d.longValue() : -1;
    }
}
