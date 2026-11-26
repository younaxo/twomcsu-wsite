package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class DeliveryProtocolTest {
    private static final String TOKEN = "123e4567-e89b-42d3-a456-426614174000";

    private static String claimJson(String jobs, String extra) {
        return "{\"jobs\":" + jobs + extra + ",\"serverTime\":\"2026-01-01T00:00:00.000Z\"}";
    }

    @Test
    void parsesClaimResponse() {
        String json = claimJson("[{\"jobId\":\"cjob00000001\",\"idempotencyKey\":\"item1:1\",\"command\":\"lp user Steve parent addtemp vip 30d\","
                + "\"claimToken\":\"" + TOKEN + "\"}]", ",\"pollAfterMs\":2000");
        DeliveryProtocol.ClaimResponse c = DeliveryProtocol.parseClaim(json);
        assertNotNull(c);
        assertEquals(2000, c.pollAfterMs());
        assertEquals(1, c.jobs().size());
        DeliveryProtocol.Job j = c.jobs().get(0);
        assertEquals("cjob00000001", j.jobId());
        assertEquals("item1:1", j.idempotencyKey());
        assertEquals("lp user Steve parent addtemp vip 30d", j.command());
        assertEquals(TOKEN, j.claimToken());
    }

    @Test
    void emptyJobsAndPollClamped() {
        assertEquals(0, DeliveryProtocol.parseClaim(claimJson("[]", ",\"pollAfterMs\":2000")).jobs().size());
        assertEquals(DeliveryProtocol.DEFAULT_POLL_MS, DeliveryProtocol.parseClaim(claimJson("[]", "")).pollAfterMs());
        assertEquals(DeliveryProtocol.MIN_POLL_MS, DeliveryProtocol.parseClaim(claimJson("[]", ",\"pollAfterMs\":1")).pollAfterMs());
        assertEquals(DeliveryProtocol.MAX_POLL_MS, DeliveryProtocol.parseClaim(claimJson("[]", ",\"pollAfterMs\":99999999")).pollAfterMs());
    }

    @Test
    void malformedJobsAreSkippedOrDegraded() {
        String jobs = "[{\"jobId\":\"bad id!\",\"claimToken\":\"" + TOKEN + "\",\"idempotencyKey\":\"a:1\",\"command\":\"give a b\"},"
                + "{\"jobId\":\"cjob00000002\",\"claimToken\":\"short\",\"idempotencyKey\":\"a:1\",\"command\":\"give a b\"},"
                + "{\"jobId\":\"cjob00000003\",\"claimToken\":\"" + TOKEN + "\",\"idempotencyKey\":\"bad key|x\",\"command\":\"give a b\"},"
                + "{\"jobId\":\"cjob00000004\",\"claimToken\":\"" + TOKEN + "\",\"idempotencyKey\":\"b:1\",\"command\":7},"
                + "{\"jobId\":\"cjob00000004\",\"claimToken\":\"" + TOKEN + "\",\"idempotencyKey\":\"b:1\",\"command\":\"give a b\"},"
                + "\"not an object\"]";
        DeliveryProtocol.ClaimResponse c = DeliveryProtocol.parseClaim(claimJson(jobs, ""));
        assertEquals(4, c.skipped()); // плохой jobId, плохой токен, дубль jobId, не объект
        assertEquals(2, c.jobs().size());
        assertNull(c.jobs().get(0).idempotencyKey()); // закроется как failed invalid_job
        assertNull(c.jobs().get(1).command());       // закроется как failed command_invalid
    }

    @Test
    void notJsonOrWrongShapeGivesNull() {
        assertNull(DeliveryProtocol.parseClaim("not json"));
        assertNull(DeliveryProtocol.parseClaim("[]"));
        assertNull(DeliveryProtocol.parseClaim("{\"jobs\":{}}"));
        assertNull(DeliveryProtocol.parseClaim(null));
        assertNull(DeliveryProtocol.parseAck("{\"results\":[1]}"));
        assertNull(DeliveryProtocol.parseAck("{}"));
    }

    @Test
    void parsesAckResponse() {
        List<DeliveryProtocol.AckResult> r = DeliveryProtocol.parseAck(
                "{\"results\":[{\"jobId\":\"a1\",\"status\":\"accepted\"},{\"jobId\":\"a2\",\"status\":\"duplicate\"},"
                        + "{\"jobId\":\"a3\",\"status\":\"rejected\",\"code\":\"token_mismatch\"}],\"serverTime\":\"x\"}");
        assertEquals(3, r.size());
        assertEquals("accepted", r.get(0).status());
        assertEquals("duplicate", r.get(1).status());
        assertEquals("rejected", r.get(2).status());
        assertEquals("token_mismatch", r.get(2).code());
    }

    @Test
    void errorCodeExtractedOnlyWhenWellFormed() {
        assertEquals("capability_missing", DeliveryProtocol.errorCode("{\"error\":\"capability_missing\"}"));
        assertNull(DeliveryProtocol.errorCode("{\"error\":\"<script>\"}"));
        assertNull(DeliveryProtocol.errorCode("oops"));
    }

    @Test
    void ackBodyShapeAndLimits() {
        DeliveryProtocol.AckItem done = new DeliveryProtocol.AckItem("cjob00000001", TOKEN, DeliveryProtocol.AckStatus.DONE, null, 0);
        DeliveryProtocol.AckItem failed = new DeliveryProtocol.AckItem("cjob00000002", TOKEN, DeliveryProtocol.AckStatus.FAILED, "command_not_allowed", 0);
        String body = new String(DeliveryProtocol.ackBody(List.of(done, failed)), StandardCharsets.UTF_8);
        assertEquals("{\"results\":[{\"jobId\":\"cjob00000001\",\"claimToken\":\"" + TOKEN + "\",\"status\":\"done\"},"
                + "{\"jobId\":\"cjob00000002\",\"claimToken\":\"" + TOKEN + "\",\"status\":\"failed\",\"code\":\"command_not_allowed\"}]}", body);

        assertThrows(IllegalArgumentException.class, () -> DeliveryProtocol.ackBody(List.of()));
        List<DeliveryProtocol.AckItem> many = new ArrayList<>();
        for (int i = 0; i < 21; i++) many.add(done);
        assertThrows(IllegalArgumentException.class, () -> DeliveryProtocol.ackBody(many));
        assertEquals(20, many.subList(0, 20).size());
        assertNotNull(DeliveryProtocol.ackBody(many.subList(0, 20)));
    }

    @Test
    void ackCodeMustMatchContractFormat() {
        assertThrows(IllegalArgumentException.class,
                () -> new DeliveryProtocol.AckItem("cjob00000001", TOKEN, DeliveryProtocol.AckStatus.FAILED, "Bad Code!", 0));
    }

    @Test
    void claimBodyClamped() {
        assertEquals("{\"max\":1}", new String(DeliveryProtocol.claimBody(0), StandardCharsets.UTF_8));
        assertEquals("{\"max\":10}", new String(DeliveryProtocol.claimBody(99), StandardCharsets.UTF_8));
    }

    @Test
    void tokenNeverInToString() {
        DeliveryProtocol.Job job = new DeliveryProtocol.Job("cjob00000001", TOKEN, "a:1", "give a b");
        DeliveryProtocol.AckItem item = new DeliveryProtocol.AckItem("cjob00000001", TOKEN, DeliveryProtocol.AckStatus.DONE, null, 0);
        assertFalse(job.toString().contains(TOKEN));
        assertFalse(item.toString().contains(TOKEN));
        assertTrue(job.toString().contains("<hidden>"));
    }
}
