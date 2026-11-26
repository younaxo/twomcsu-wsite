package ru.twomc.bridge;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Разбор ответов и сборка тел запросов claim/ack (контракт 14.2, 14.3). Токен захвата нигде не печатается. */
final class DeliveryProtocol {
    private DeliveryProtocol() {}

    static final long DEFAULT_POLL_MS = 2_000;
    static final long MIN_POLL_MS = 500;
    static final long MAX_POLL_MS = 300_000;

    enum AckStatus {
        DONE("done"), FAILED("failed"), RETRY("retry"), UNKNOWN("unknown");

        final String wire;

        AckStatus(String wire) {
            this.wire = wire;
        }
    }

    /** idempotencyKey и command null, если поле пришло в неверном формате (задание всё равно можно закрыть как failed). */
    record Job(String jobId, String claimToken, String idempotencyKey, String command) {
        @Override
        public String toString() {
            return "Job[jobId=" + jobId + ", key=" + idempotencyKey + ", claimToken=<hidden>]";
        }
    }

    record ClaimResponse(List<Job> jobs, long pollAfterMs, int skipped) {}

    /** Элемент очереди ack; изменяется только из потока ввода-вывода плагина (кроме добавления под блокировкой очереди). */
    static final class AckItem {
        final String jobId;
        final String claimToken;
        final AckStatus status;
        final String code;
        final long createdAtMs;
        int attempts;

        AckItem(String jobId, String claimToken, AckStatus status, String code, long createdAtMs) {
            if (code != null && !Protocol.CODE.matcher(code).matches()) {
                throw new IllegalArgumentException("code");
            }
            this.jobId = jobId;
            this.claimToken = claimToken;
            this.status = status;
            this.code = code;
            this.createdAtMs = createdAtMs;
        }

        @Override
        public String toString() {
            return "AckItem[jobId=" + jobId + ", status=" + status.wire + ", code=" + code + ", claimToken=<hidden>]";
        }
    }

    record AckResult(String jobId, String status, String code) {}

    // ---- разбор ----

    /** null, если тело не является ожидаемым JSON-объектом. */
    @SuppressWarnings("unchecked")
    static ClaimResponse parseClaim(String body) {
        Map<String, Object> root = MiniJson.parseObject(body);
        if (root == null || !(root.get("jobs") instanceof List<?> list)) {
            return null;
        }
        long poll = DEFAULT_POLL_MS;
        if (root.get("pollAfterMs") instanceof Long p) {
            poll = Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, p));
        }
        List<Job> jobs = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int skipped = 0;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) {
                skipped++;
                continue;
            }
            Map<String, Object> job = (Map<String, Object>) m;
            String jobId = job.get("jobId") instanceof String s ? s : null;
            String token = job.get("claimToken") instanceof String s ? s : null;
            if (jobId == null || token == null || !Protocol.JOB_ID.matcher(jobId).matches()
                    || !Protocol.CLAIM_TOKEN.matcher(token).matches() || !seen.add(jobId)) {
                skipped++; // без верных jobId и claimToken задание закрыть нельзя
                continue;
            }
            String key = job.get("idempotencyKey") instanceof String s && Protocol.IDEMPOTENCY_KEY.matcher(s).matches() ? s : null;
            String command = job.get("command") instanceof String s ? s : null;
            jobs.add(new Job(jobId, token, key, command));
        }
        return new ClaimResponse(List.copyOf(jobs), poll, skipped);
    }

    /** null, если тело не является ожидаемым JSON-объектом. */
    @SuppressWarnings("unchecked")
    static List<AckResult> parseAck(String body) {
        Map<String, Object> root = MiniJson.parseObject(body);
        if (root == null || !(root.get("results") instanceof List<?> list)) {
            return null;
        }
        List<AckResult> out = new ArrayList<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) {
                return null;
            }
            Map<String, Object> r = (Map<String, Object>) m;
            if (!(r.get("jobId") instanceof String id) || !(r.get("status") instanceof String st)) {
                return null;
            }
            String code = r.get("code") instanceof String c ? c : null;
            out.add(new AckResult(id, st, code));
        }
        return out;
    }

    /** Значение поля error тела ошибки (для лога) или null. */
    static String errorCode(String body) {
        Map<String, Object> root = MiniJson.parseObject(body);
        if (root != null && root.get("error") instanceof String s && s.matches("^[a-z_]{1,40}$")) {
            return s;
        }
        return null;
    }

    // ---- сборка тел ----

    static byte[] claimBody(int max) {
        int m = Math.max(1, Math.min(Protocol.CLAIM_MAX_LIMIT, max));
        return ("{\"max\":" + m + "}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    static byte[] ackBody(List<AckItem> items) {
        if (items.isEmpty() || items.size() > Protocol.ACK_MAX_ITEMS) {
            throw new IllegalArgumentException("ack batch size");
        }
        StringBuilder sb = new StringBuilder("{\"results\":[");
        for (int i = 0; i < items.size(); i++) {
            AckItem it = items.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"jobId\":").append(quote(it.jobId))
                    .append(",\"claimToken\":").append(quote(it.claimToken))
                    .append(",\"status\":").append(quote(it.status.wire));
            if (it.code != null) {
                sb.append(",\"code\":").append(quote(it.code));
            }
            sb.append('}');
        }
        return sb.append("]}").toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    /** Все значения уже прошли проверку форматом, но экранирование оставлено как защита. */
    static String quote(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append('"').toString();
    }
}
