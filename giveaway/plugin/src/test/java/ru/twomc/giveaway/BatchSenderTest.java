package ru.twomc.giveaway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class BatchSenderTest {
    private static final Logger LOG = Logger.getLogger("test");
    private static final UUID U = UUID.fromString("069a79f4-44e9-4726-a5be-fca90e38aaf5");

    @TempDir
    Path dir;

    static final class FakeTransport implements BatchSender.Transport {
        final List<Map<String, String>> headers = new ArrayList<>();
        final List<byte[]> bodies = new ArrayList<>();
        int status = 200;
        String retryAfter;
        String respBody;
        boolean throwIo;

        @Override
        public BatchSender.Response post(URI uri, Map<String, String> h, byte[] body) throws IOException {
            if (throwIo) throw new IOException("down");
            headers.add(h);
            bodies.add(body);
            return new BatchSender.Response(status, retryAfter, respBody);
        }
    }

    private final AtomicLong now = new AtomicLong(1_795_341_605_000L);
    private final FakeTransport tr = new FakeTransport();

    private EventQueue queue() {
        return new EventQueue(dir, 10_000, LOG);
    }

    private BatchSender sender(EventQueue q) {
        SenderConfig cfg = SenderConfig.of(URI.create("https://example.test/api/giveaway/v1/events"), "survival-1", 3,
                new byte[32]);
        return new BatchSender(q, cfg, tr, now::get, LOG, () -> 0.5);
    }

    private static int countEvents(byte[] body) {
        String s = new String(body, StandardCharsets.UTF_8);
        int n = 0;
        int i = 0;
        while ((i = s.indexOf("\"eventId\"", i)) >= 0) {
            n++;
            i++;
        }
        return n;
    }

    @Test
    void classification() {
        assertEquals(BatchSender.Outcome.ACK, BatchSender.classify(200));
        assertEquals(BatchSender.Outcome.DEAD_LETTER, BatchSender.classify(422));
        assertEquals(BatchSender.Outcome.DEAD_LETTER, BatchSender.classify(413));
        assertEquals(BatchSender.Outcome.RETRY, BatchSender.classify(400));
        for (int s : new int[] {401, 403, 429, 500, 503, 302}) {
            assertEquals(BatchSender.Outcome.RETRY, BatchSender.classify(s), "status " + s);
        }
    }

    @Test
    void backoffGrowsAndCaps() {
        assertEquals(10_000L, BatchSender.backoffMillis(1, 0.5));
        assertEquals(20_000L, BatchSender.backoffMillis(2, 0.5));
        assertEquals(40_000L, BatchSender.backoffMillis(3, 0.5));
        assertEquals(BatchSender.BACKOFF_MAX_MS, BatchSender.backoffMillis(50, 0.5));
        assertTrue(BatchSender.backoffMillis(2, 0.0) < BatchSender.backoffMillis(2, 0.99));
        assertEquals(30_000L, BatchSender.parseRetryAfterMillis("30"));
        assertEquals(-1L, BatchSender.parseRetryAfterMillis("Wed, 21 Oct"));
        assertEquals(BatchSender.RETRY_AFTER_MAX_MS, BatchSender.parseRetryAfterMillis("999999"));
    }

    @Test
    void sendsBatchesOfAtMost100SignedPerContract() {
        EventQueue q = queue();
        for (int i = 0; i < 250; i++) q.enqueue(GiveawayEvent.heartbeat(U, "Notch", now.get() - 1000 - i, true));
        sender(q).runOnce();
        assertEquals(3, tr.bodies.size());
        assertEquals(0, q.size());
        assertEquals(100, countEvents(tr.bodies.get(0)));
        assertEquals(100, countEvents(tr.bodies.get(1)));
        assertEquals(50, countEvents(tr.bodies.get(2)));
        for (int i = 0; i < 3; i++) {
            byte[] body = tr.bodies.get(i);
            Map<String, String> h = tr.headers.get(i);
            assertEquals("survival-1.3", h.get(Protocol.HEADER_KEY_ID));
            assertEquals("1795341605", h.get(Protocol.HEADER_TIMESTAMP));
            assertEquals(Signer.sign(new byte[32], "survival-1.3", "1795341605", h.get(Protocol.HEADER_NONCE),
                    "POST", "/api/giveaway/v1/events", body), h.get(Protocol.HEADER_SIGNATURE));
            assertTrue(body.length < Protocol.MAX_BODY_BYTES);
        }
        assertEquals(3, tr.headers.stream().map(h -> h.get(Protocol.HEADER_NONCE)).distinct().count());
    }

    @Test
    void failureKeepsEventsAndBacksOff() {
        EventQueue q = queue();
        q.enqueue(GiveawayEvent.join(U, "Notch", now.get() - 1000));
        BatchSender s = sender(q);
        tr.status = 503;
        tr.retryAfter = "120";
        s.runOnce();
        assertEquals(1, q.size());
        assertEquals(1, s.consecutiveFailures());
        assertEquals(now.get() + 120_000L, s.nextAttemptAt());

        s.runOnce();
        assertEquals(1, tr.bodies.size());

        now.addAndGet(121_000L);
        tr.status = 200;
        s.runOnce();
        assertEquals(0, q.size());
        assertEquals(0, s.consecutiveFailures());
    }

    @Test
    void networkErrorKeepsEvents() {
        EventQueue q = queue();
        q.enqueue(GiveawayEvent.join(U, "Notch", now.get() - 1000));
        tr.throwIo = true;
        BatchSender s = sender(q);
        s.runOnce();
        assertEquals(1, q.size());
        assertEquals("network:IOException", s.lastError());
    }

    @Test
    void schemaErrorGoesToDeadLetterWithoutRetry() {
        EventQueue q = queue();
        q.enqueue(GiveawayEvent.join(U, "Notch", now.get() - 1000));
        tr.status = 422;
        BatchSender s = sender(q);
        s.runOnce();
        assertEquals(0, q.size());
        assertEquals(1, q.deadLettered());
        assertEquals(1, tr.bodies.size());
        s.runOnce();
        assertEquals(1, tr.bodies.size());
    }

    @Test
    void status413And422GoToDeadLetter() {
        for (int st : new int[] {413, 422}) {
            tr.bodies.clear();
            EventQueue q = new EventQueue(mk("d" + st), 10_000, LOG);
            q.enqueue(GiveawayEvent.join(U, "Notch", now.get() - 1000));
            tr.status = st;
            sender(q).runOnce();
            assertEquals(0, q.size(), "status " + st);
            assertEquals(1, q.deadLettered());
        }
    }

    private Path mk(String n) {
        try { return java.nio.file.Files.createDirectories(dir.resolve(n)); } catch (IOException e) { throw new RuntimeException(e); }
    }

    @Test
    void status400RetriesWithBackoffThenDeadLettersAfterFive() {
        EventQueue q = queue();
        q.enqueue(GiveawayEvent.join(U, "Notch", now.get() - 1000));
        BatchSender s = sender(q);
        tr.status = 400;
        for (int i = 1; i < BatchSender.MAX_CONSECUTIVE_400; i++) {
            s.runOnce();
            assertEquals(1, q.size(), "attempt " + i);
            assertEquals(0, q.deadLettered());
            assertEquals(i, s.consecutiveFailures());
            now.addAndGet(BatchSender.BACKOFF_MAX_MS + 1);
        }
        s.runOnce();
        assertEquals(0, q.size());
        assertEquals(1, q.deadLettered());
        assertEquals(BatchSender.MAX_CONSECUTIVE_400, tr.bodies.size());
        assertEquals(0, s.consecutiveFailures());
    }

    @Test
    void status400ThenSuccessResetsCounter() {
        EventQueue q = queue();
        q.enqueue(GiveawayEvent.join(U, "Notch", now.get() - 1000));
        BatchSender s = sender(q);
        tr.status = 400;
        s.runOnce();
        now.addAndGet(BatchSender.BACKOFF_MAX_MS + 1);
        tr.status = 200;
        s.runOnce();
        assertEquals(0, q.size());
        assertEquals(0, q.deadLettered());
    }

    @Test
    void rejectedInOkResponseIsCountedWithoutIdentifiers() {
        EventQueue q = queue();
        q.enqueue(GiveawayEvent.join(U, "Notch", now.get() - 1000));
        java.util.List<String> logs = new ArrayList<>();
        Logger lg = Logger.getAnonymousLogger();
        lg.setUseParentHandlers(false);
        lg.addHandler(new java.util.logging.Handler() {
            public void publish(java.util.logging.LogRecord r) { logs.add(r.getMessage()); }
            public void flush() {}
            public void close() {}
        });
        SenderConfig cfg = SenderConfig.of(URI.create("https://example.test/api/giveaway/v1/events"), "survival-1", 3, new byte[32]);
        BatchSender s = new BatchSender(q, cfg, tr, now::get, lg, () -> 0.5);
        tr.respBody = "{\"accepted\":0,\"rejected\":[{\"eventId\":\"e1\",\"reason\":\"in_future\"},{\"eventId\":\"e2\",\"reason\":\"too_old\"},{\"eventId\":\"e3\",\"reason\":\"in_future\"}]}";
        s.runOnce();
        assertEquals(0, q.size());
        assertEquals(3, s.rejectedTotal());
        assertEquals(java.util.Map.of("in_future", 2, "too_old", 1), BatchSender.parseRejectedReasons(tr.respBody));
        assertEquals(1, logs.size());
        assertTrue(logs.get(0).contains("in_future=2") && logs.get(0).contains("NTP"));
        assertTrue(!logs.get(0).contains("e1") && !logs.get(0).contains("Notch"));
    }

    @Test
    void eventsOlderThan72hAreDroppedLocally() {
        EventQueue q = queue();
        q.enqueue(GiveawayEvent.join(U, "Notch", now.get() - Protocol.MAX_EVENT_AGE.toMillis() - 1));
        sender(q).runOnce();
        assertEquals(0, q.size());
        assertEquals(0, tr.bodies.size());
    }

    @Test
    void unconfiguredSenderDoesNotSendButKeepsQueue() {
        EventQueue q = queue();
        q.enqueue(GiveawayEvent.join(U, "Notch", now.get() - 1000));
        new BatchSender(q, null, tr, now::get, LOG, () -> 0.5).runOnce();
        assertEquals(0, tr.bodies.size());
        assertEquals(1, q.size());
    }
}
