package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.logging.Handler;
import java.util.logging.LogRecord;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Оркестратор без сервера Minecraft: поддельные транспорт, главный поток и планировщик. */
class DeliveryEngineTest {
    private static final String HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    private static final String TOKEN1 = "123e4567-e89b-42d3-a456-426614174001";
    private static final String TOKEN2 = "123e4567-e89b-42d3-a456-426614174002";
    private static final String TOKEN3 = "123e4567-e89b-42d3-a456-426614174003";
    private static final String KEY_ID = "survival.1";

    @TempDir
    Path dir;

    // ---- поддельные зависимости ----

    record Req(String path, Map<String, String> headers, String body) {}

    static final class FakeTransport implements Transport {
        final List<Req> requests = new ArrayList<>();
        final List<Function<Req, Object>> script = new ArrayList<>();

        void then(Function<Req, Object> f) {
            script.add(f);
        }

        void thenResponse(Transport.Response r) {
            script.add(req -> r);
        }

        @Override
        public Response post(URI uri, Map<String, String> headers, byte[] body) throws IOException {
            Req req = new Req(uri.getPath(), headers, new String(body, StandardCharsets.UTF_8));
            requests.add(req);
            if (script.isEmpty()) {
                throw new IOException("no script");
            }
            Object o = script.remove(0).apply(req);
            if (o instanceof IOException e) throw e;
            return (Response) o;
        }

        List<Req> to(String path) {
            return requests.stream().filter(r -> r.path().equals(path)).toList();
        }
    }

    static final class ManualScheduler implements Scheduler {
        final List<Runnable> queue = new ArrayList<>();
        long lastDelay = -1;
        boolean shutdown;

        @Override
        public void execute(Runnable r) {
            queue.add(r);
        }

        @Override
        public Cancellable schedule(long delayMs, Runnable r) {
            lastDelay = delayMs;
            return () -> { };
        }

        @Override
        public void runAndAwait(Runnable r, long timeoutMs) {
            r.run();
        }

        @Override
        public void shutdown() {
            shutdown = true;
        }

        void drain() {
            while (!queue.isEmpty()) queue.remove(0).run();
        }
    }

    static final class CapturingHandler extends Handler {
        final StringBuilder text = new StringBuilder();

        @Override
        public void publish(LogRecord r) {
            text.append(r.getMessage()).append('\n');
        }

        @Override
        public void flush() { }

        @Override
        public void close() { }
    }

    /** Хранилище, у которого запись «начала» не удаётся (диск отвалился). */
    static final class BrokenStore implements KeyStore {
        boolean healthy = true;

        @Override public State state(String key) { return State.NONE; }
        @Override public boolean begin(String key) { healthy = false; return false; }
        @Override public boolean finish(String key, State outcome) { return false; }
        @Override public boolean forget(String key) { return false; }
        @Override public boolean healthy() { return healthy; }
        @Override public int size() { return 0; }
        @Override public void close() { }
    }

    final class Harness {
        final AtomicLong now = new AtomicLong(1_800_000_000_000L);
        final FakeTransport transport = new FakeTransport();
        final ManualScheduler scheduler = new ManualScheduler();
        final List<Runnable> mainQueue = new ArrayList<>();
        final List<String> dispatched = new ArrayList<>();
        final CapturingHandler logs = new CapturingHandler();
        final KeyStore store;
        final DeliveryEngine engine;
        boolean mainRejects;
        Function<String, Boolean> runner = c -> true;

        Harness(KeyStore storeOverride, int maxPerClaim) throws IOException {
            Logger logger = Logger.getLogger("engine-test-" + System.nanoTime());
            logger.setUseParentHandlers(false);
            logger.addHandler(logs);
            store = storeOverride != null ? storeOverride : FileKeyStore.open(dir, now::get, 180L * 24 * 3600 * 1000, logger);
            BridgeApi api = new BridgeApi(URI.create("https://example.invalid"), KEY_ID, HexFormat.of().parseHex(HEX), transport, now::get);
            engine = new DeliveryEngine(api, store, CommandPolicy.of(List.of()),
                    r -> {
                        if (mainRejects) throw new IllegalStateException("plugin disabled");
                        mainQueue.add(r);
                    },
                    cmd -> {
                        dispatched.add(cmd);
                        return runner.apply(cmd);
                    },
                    scheduler, now::get, () -> 0.5, logger, maxPerClaim);
        }

        Harness() throws IOException {
            this(null, 5);
        }

        void runMain() {
            while (!mainQueue.isEmpty()) mainQueue.remove(0).run();
        }

        void assertNoSecretsLogged() {
            String all = logs.text.toString();
            assertFalse(all.contains(TOKEN1) || all.contains(TOKEN2) || all.contains(TOKEN3), "claimToken попал в лог");
            assertFalse(all.contains(HEX), "секрет попал в лог");
        }
    }

    // ---- помощники ответов ----

    private static String job(String id, String key, String cmd, String token) {
        return "{\"jobId\":\"" + id + "\",\"idempotencyKey\":\"" + key + "\",\"command\":\"" + cmd + "\",\"claimToken\":\"" + token + "\"}";
    }

    private static Transport.Response claimResponse(long pollAfterMs, String... jobs) {
        return new Transport.Response(200, null, null,
                "{\"jobs\":[" + String.join(",", jobs) + "],\"pollAfterMs\":" + pollAfterMs + ",\"serverTime\":\"2026-01-01T00:00:00.000Z\"}");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> results(Req req) {
        return (List<Map<String, Object>>) (List<?>) MiniJson.parseObject(req.body()).get("results");
    }

    private static Function<Req, Object> ackAll(String status, String code) {
        return req -> {
            StringBuilder sb = new StringBuilder("{\"results\":[");
            boolean first = true;
            for (Map<String, Object> r : results(req)) {
                if (!first) sb.append(',');
                first = false;
                sb.append("{\"jobId\":\"").append(r.get("jobId")).append("\",\"status\":\"").append(status).append('"');
                if (code != null) sb.append(",\"code\":\"").append(code).append('"');
                sb.append('}');
            }
            return new Transport.Response(200, null, null, sb.append("],\"serverTime\":\"x\"}").toString());
        };
    }

    private static String statusOf(Req ack, int index) {
        return (String) results(ack).get(index).get("status");
    }

    private static String codeOf(Req ack, int index) {
        return (String) results(ack).get(index).get("code");
    }

    // ---- сценарии ----

    @Test
    void happyPath_commandsRunOnMainThreadOnly_thenSignedAckBatch() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1),
                job("cjob00000002", "item2:1", "lp user Steve parent addtemp vip 30d", TOKEN2)));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle();
        assertEquals(1, h.transport.to(Protocol.PATH_CLAIM).size());
        assertEquals("{\"max\":5}", h.transport.requests.get(0).body());
        assertTrue(h.dispatched.isEmpty(), "команда не должна выполняться вне главного потока");
        assertEquals(2, h.mainQueue.size());
        assertEquals(2, h.engine.status().inFlight());

        h.runMain();
        assertEquals(List.of("give Steve diamond 1", "lp user Steve parent addtemp vip 30d"), h.dispatched);
        assertEquals(0, h.engine.status().inFlight());

        h.scheduler.drain(); // немедленный kick: ack уходит сразу
        List<Req> acks = h.transport.to(Protocol.PATH_ACK);
        assertEquals(1, acks.size());
        assertEquals(2, results(acks.get(0)).size());
        assertEquals("done", statusOf(acks.get(0), 0));
        assertEquals("done", statusOf(acks.get(0), 1));
        assertEquals(0, h.engine.status().outbox());
        assertEquals(KeyStore.State.DONE, h.store.state("item1:1"));

        // Подпись и заголовки сверяются с независимым расчётом.
        for (Req r : h.transport.requests) {
            assertEquals(KEY_ID, r.headers().get("x-twomc-key-id"));
            assertEquals("1", r.headers().get("x-twomc-protocol"));
            assertEquals(Signer.sign(HexFormat.of().parseHex(HEX), KEY_ID, r.headers().get("x-twomc-timestamp"),
                    r.headers().get("x-twomc-nonce"), "POST", r.path(), r.body().getBytes(StandardCharsets.UTF_8)),
                    r.headers().get("x-twomc-signature"));
            assertTrue(r.headers().get("x-twomc-nonce").matches("^[A-Za-z0-9_-]{22,43}$"));
        }
        // Следующий claim не раньше pollAfterMs.
        h.engine.cycle();
        assertEquals(1, h.transport.to(Protocol.PATH_CLAIM).size());
        assertTrue(h.scheduler.lastDelay <= 2000 && h.scheduler.lastDelay > 0);
        h.assertNoSecretsLogged();
    }

    @Test
    void alreadyDoneKey_answersDoneWithoutExecuting() throws IOException {
        Harness h = new Harness();
        assertTrue(h.store.begin("item1:1"));
        assertTrue(h.store.finish("item1:1", KeyStore.State.DONE));
        h.transport.thenResponse(claimResponse(2000, job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1)));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();

        assertTrue(h.dispatched.isEmpty(), "повторная выдача выполненного ключа недопустима (R167)");
        Req ack = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("done", statusOf(ack, 0));
    }

    @Test
    void startedKeyAfterCrash_answersUnknownAndDoesNotExecute() throws IOException {
        Harness h = new Harness();
        assertTrue(h.store.begin("item1:1")); // «упали» между началом и записью исхода
        h.transport.thenResponse(claimResponse(2000, job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1)));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();

        assertTrue(h.dispatched.isEmpty());
        Req ack = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("unknown", statusOf(ack, 0));
        assertEquals("outcome_unknown", codeOf(ack, 0));
    }

    @Test
    void whitelistViolationsAreFailedWithoutExecutionOrJournal() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "op Steve", TOKEN1),
                job("cjob00000002", "item2:1", "tp Steve 0 0 0", TOKEN2),
                job("cjob00000003", "item3:1", "give Steve diamond 1\\nop Steve", TOKEN3)));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();

        assertTrue(h.dispatched.isEmpty());
        Req ack = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("failed", statusOf(ack, 0));
        assertEquals("command_forbidden", codeOf(ack, 0));
        assertEquals("command_not_allowed", codeOf(ack, 1));
        assertEquals("command_invalid", codeOf(ack, 2));
        assertEquals(KeyStore.State.NONE, h.store.state("item1:1"));
    }

    @Test
    void allowedRootWithDisallowedShape_isFailedCommandNotAllowed_withoutExecutionOrJournal() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "lp user Steve permission set a.b true", TOKEN1),
                job("cjob00000002", "item2:1", "eco give Steve -5", TOKEN2)));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();

        assertTrue(h.dispatched.isEmpty(), "команда с неразрешённой формой не исполняется");
        Req ack = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("failed", statusOf(ack, 0));
        assertEquals("command_not_allowed", codeOf(ack, 0));
        assertEquals("failed", statusOf(ack, 1));
        assertEquals("command_not_allowed", codeOf(ack, 1));
        assertEquals(KeyStore.State.NONE, h.store.state("item1:1"));
        assertEquals(KeyStore.State.NONE, h.store.state("item2:1"));
    }

    @Test
    void malformedJobFieldsAreClosedAsFailed() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(new Transport.Response(200, null, null,
                "{\"jobs\":[{\"jobId\":\"cjob00000001\",\"claimToken\":\"" + TOKEN1 + "\",\"idempotencyKey\":\"bad key\",\"command\":\"give a b\"}],\"pollAfterMs\":2000}"));
        h.transport.then(ackAll("accepted", null));
        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        assertTrue(h.dispatched.isEmpty());
        assertEquals("invalid_job", codeOf(h.transport.to(Protocol.PATH_ACK).get(0), 0));
    }

    @Test
    void serverRejectedCommand_isFailed_andSameKeyMayBeRetriedLater() throws IOException {
        Harness h = new Harness();
        h.runner = c -> false;
        h.transport.thenResponse(claimResponse(2000, job("cjob00000001", "item1:1", "give Ghost diamond 1", TOKEN1)));
        h.transport.then(ackAll("accepted", null));
        h.transport.thenResponse(claimResponse(2000, job("cjob00000002", "item1:1", "give Ghost diamond 1", TOKEN2)));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        Req first = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("failed", statusOf(first, 0));
        assertEquals("command_rejected", codeOf(first, 0));
        assertEquals(KeyStore.State.FAILED, h.store.state("item1:1"));

        h.runner = c -> true; // сайт вернул заказ в очередь (FAILED -> QUEUED) с тем же ключом
        h.now.addAndGet(3000);
        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        assertEquals(2, h.dispatched.size());
        assertEquals("done", statusOf(h.transport.to(Protocol.PATH_ACK).get(1), 0));
        assertEquals(KeyStore.State.DONE, h.store.state("item1:1"));
    }

    @Test
    void dispatchException_isUnknown_andNeverRepeated() throws IOException {
        Harness h = new Harness();
        h.runner = c -> { throw new IllegalStateException("boom"); };
        h.transport.thenResponse(claimResponse(2000, job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1)));
        h.transport.then(ackAll("accepted", null));
        h.transport.thenResponse(claimResponse(2000, job("cjob00000002", "item1:1", "give Steve diamond 1", TOKEN2)));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        Req first = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("unknown", statusOf(first, 0));
        assertEquals("dispatch_exception", codeOf(first, 0));
        assertEquals(KeyStore.State.UNKNOWN, h.store.state("item1:1"));

        h.runner = c -> true;
        h.now.addAndGet(3000);
        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        assertEquals(1, h.dispatched.size(), "после неизвестного исхода команда не повторяется");
        assertEquals("outcome_unknown", codeOf(h.transport.to(Protocol.PATH_ACK).get(1), 0));
    }

    @Test
    void sameKeyTwiceInOneClaim_executesOnce() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1),
                job("cjob00000002", "item1:1", "give Steve diamond 1", TOKEN2)));
        h.transport.then(ackAll("accepted", null));
        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        assertEquals(1, h.dispatched.size());
        Req ack = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("done", statusOf(ack, 0));
        assertEquals("done", statusOf(ack, 1));
    }

    @Test
    void ack503_resendsWholeBatchWithFreshNonce_untilAccepted_andNoClaimMeanwhile() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1),
                job("cjob00000002", "item2:1", "give Alex diamond 1", TOKEN2)));
        h.transport.thenResponse(new Transport.Response(503, "5", null, "{\"error\":\"unavailable\"}"));
        h.transport.then(req -> new IOException("connection reset"));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle();
        h.runMain();
        h.scheduler.drain(); // ack #1: 503
        assertEquals(2, h.engine.status().outbox());
        assertTrue(h.scheduler.lastDelay >= 5000, "Retry-After не нарушен");

        h.now.addAndGet(60_000);
        h.engine.cycle(); // ack #2: сетевая ошибка
        assertEquals(2, h.engine.status().outbox());
        assertEquals(1, h.transport.to(Protocol.PATH_CLAIM).size(), "новый claim до подтверждения не выполняется");
        h.now.addAndGet(60_000);
        h.engine.cycle(); // ack #3: принято
        assertEquals(0, h.engine.status().outbox());

        List<Req> acks = h.transport.to(Protocol.PATH_ACK);
        assertEquals(3, acks.size());
        assertEquals(acks.get(0).body(), acks.get(1).body(), "повтор той же пачки с тем же содержимым");
        assertEquals(acks.get(0).body(), acks.get(2).body());
        assertNotEquals(acks.get(0).headers().get("x-twomc-nonce"), acks.get(1).headers().get("x-twomc-nonce"));
        assertNotEquals(acks.get(1).headers().get("x-twomc-nonce"), acks.get(2).headers().get("x-twomc-nonce"));
        assertNotEquals(acks.get(0).headers().get("x-twomc-signature"), acks.get(2).headers().get("x-twomc-signature"));
        // Контракт 14.6: claim только при пустой очереди ack. После accepted (ack #3) очередь пуста, и claim в том же
        // цикле допустим, но строго ПОСЛЕ последнего ack: ни один claim не предшествует подтверждению.
        List<Req> all = h.transport.requests;
        int lastAck = -1;
        for (int i = 0; i < all.size(); i++) if (all.get(i).path().equals(Protocol.PATH_ACK)) lastAck = i;
        for (int i = 1; i < all.size(); i++) {
            if (all.get(i).path().equals(Protocol.PATH_CLAIM)) assertTrue(i > lastAck, "второй claim только после принятого ack");
        }
        h.assertNoSecretsLogged();
    }

    @Test
    void duplicateAckResultCountsAsDelivered() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000, job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1)));
        h.transport.then(ackAll("duplicate", null));
        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        assertEquals(0, h.engine.status().outbox());
    }

    @Test
    void rejectedAckResults_areDroppedNotRetried() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1),
                job("cjob00000002", "item2:1", "give Alex diamond 1", TOKEN2),
                job("cjob00000003", "item3:1", "give Bob diamond 1", TOKEN3)));
        h.transport.then(req -> {
            List<Map<String, Object>> rs = results(req);
            String[] codes = {"unknown_job", "token_mismatch", "conflict"};
            StringBuilder sb = new StringBuilder("{\"results\":[");
            for (int i = 0; i < rs.size(); i++) {
                if (i > 0) sb.append(',');
                sb.append("{\"jobId\":\"").append(rs.get(i).get("jobId")).append("\",\"status\":\"rejected\",\"code\":\"").append(codes[i]).append("\"}");
            }
            return new Transport.Response(200, null, null, sb.append("]}").toString());
        });
        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        assertEquals(0, h.engine.status().outbox());
        assertEquals(1, h.transport.to(Protocol.PATH_ACK).size());
        // Выполненные ключи остаются в журнале, несмотря на отказ в ack.
        assertEquals(KeyStore.State.DONE, h.store.state("item1:1"));
        assertTrue(h.logs.text.toString().contains("token_mismatch"));
        h.assertNoSecretsLogged();
    }

    @Test
    void missingAckResultIsRetried() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1),
                job("cjob00000002", "item2:1", "give Alex diamond 1", TOKEN2)));
        h.transport.thenResponse(new Transport.Response(200, null, null,
                "{\"results\":[{\"jobId\":\"cjob00000001\",\"status\":\"accepted\"}]}"));
        h.transport.then(ackAll("accepted", null));
        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        assertEquals(1, h.engine.status().outbox());
        assertEquals(1, h.transport.to(Protocol.PATH_ACK).size(), "неполный ответ не повторяется в том же цикле");
        h.engine.cycle(); // гейт бэкоффа ещё закрыт: запроса нет
        assertEquals(1, h.transport.to(Protocol.PATH_ACK).size());
        h.now.addAndGet(60_000);
        h.engine.cycle();
        assertEquals(0, h.engine.status().outbox());
        assertEquals(1, results(h.transport.to(Protocol.PATH_ACK).get(1)).size());
    }

    @Test
    void ackIsSentInBatchesOfTwenty() throws IOException {
        Harness h = new Harness();
        for (int i = 0; i < 25; i++) {
            String id = String.format("cjob%08d", i);
            h.engine.enqueueAck(new DeliveryProtocol.Job(id, TOKEN1, "k" + i + ":1", "give a b"), DeliveryProtocol.AckStatus.DONE, null);
        }
        h.transport.then(ackAll("accepted", null));
        h.transport.then(ackAll("accepted", null));
        h.engine.cycle();
        List<Req> acks = h.transport.to(Protocol.PATH_ACK);
        assertEquals(2, acks.size());
        assertEquals(20, results(acks.get(0)).size());
        assertEquals(5, results(acks.get(1)).size());
        assertEquals(0, h.engine.status().outbox());
    }

    @Test
    void claim429_honoursRetryAfter_andPollAfterMs() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(new Transport.Response(429, "7", null, "{\"error\":\"rate_limited\"}"));
        h.transport.thenResponse(claimResponse(5000));
        h.transport.thenResponse(claimResponse(5000));

        h.engine.cycle();
        assertTrue(h.scheduler.lastDelay >= 7000);

        h.now.addAndGet(8000);
        h.engine.cycle(); // пустой ответ, pollAfterMs = 5000
        assertEquals(2, h.transport.requests.size());
        assertEquals(5000, h.scheduler.lastDelay);

        h.now.addAndGet(1000);
        h.engine.cycle(); // слишком рано: запроса быть не должно
        assertEquals(2, h.transport.requests.size());
        assertTrue(h.scheduler.lastDelay <= 4000);

        h.now.addAndGet(4000);
        h.engine.cycle();
        assertEquals(3, h.transport.requests.size());
    }

    @Test
    void claim503_backsOffExponentiallyWithoutRetryAfter() throws IOException {
        Harness h = new Harness();
        for (int i = 0; i < 3; i++) h.transport.thenResponse(new Transport.Response(503, null, null, "{\"error\":\"unavailable\"}"));
        h.engine.cycle();
        long d1 = h.scheduler.lastDelay;
        h.now.addAndGet(600_000); // гейт бэкоффа единый: без выдержки запроса не будет
        h.engine.cycle();
        long d2 = h.scheduler.lastDelay;
        h.now.addAndGet(600_000);
        h.engine.cycle();
        long d3 = h.scheduler.lastDelay;
        assertEquals(3, h.transport.requests.size());
        assertTrue(d1 < d2 && d2 < d3, d1 + " " + d2 + " " + d3);
    }

    @Test
    void auth401_retriesThreeTimesThenPausesFiveMinutes() throws IOException {
        Harness h = new Harness();
        for (int i = 0; i < 4; i++) {
            h.transport.thenResponse(new Transport.Response(401, null, "Tue, 24 Nov 2026 12:00:00 GMT", "{\"error\":\"unauthorized\"}"));
        }
        for (int i = 0; i < 3; i++) {
            h.engine.cycle();
            assertEquals(0, h.engine.status().pausedForMs());
            h.now.addAndGet(20_000); // дольше бэкоффа 2/4/8 с
        }
        assertEquals(3, h.transport.requests.size());
        h.engine.cycle(); // четвёртый 401 подряд
        assertEquals(300_000, h.scheduler.lastDelay);
        assertTrue(h.engine.status().pausedForMs() > 0);
        int before = h.transport.requests.size();
        h.now.addAndGet(10_000);
        h.engine.cycle();
        assertEquals(before, h.transport.requests.size(), "во время паузы запросов нет");
        h.now.addAndGet(300_000);
        assertEquals(0, h.engine.status().pausedForMs());
        assertTrue(h.logs.text.toString().contains("401"));
        h.assertNoSecretsLogged();
    }

    @Test
    void claim403_pausesBecauseRetryCannotHelp() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(new Transport.Response(403, null, null, "{\"error\":\"capability_missing\"}"));
        h.engine.cycle();
        assertEquals(300_000, h.scheduler.lastDelay);
        assertTrue(h.logs.text.toString().contains("capability_missing"));
    }

    @Test
    void kickAfterRateLimitedAck_doesNotBypassRetryAfter_andNoClaimMeanwhile() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1),
                job("cjob00000002", "item2:1", "give Alex diamond 1", TOKEN2)));
        h.transport.thenResponse(new Transport.Response(429, "30", null, "{\"error\":\"rate_limited\"}"));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle(); // claim
        h.mainQueue.remove(0).run(); // первое задание выполнено: ack в очереди и kick
        h.scheduler.drain(); // ack #1: 429 с Retry-After 30 с
        assertEquals(1, h.transport.to(Protocol.PATH_ACK).size());
        assertTrue(h.scheduler.lastDelay >= 30_000, "Retry-After не нарушен: " + h.scheduler.lastDelay);

        h.mainQueue.remove(0).run(); // второе задание выполнено: новый kick, гейт всё ещё закрыт
        h.scheduler.drain();
        assertEquals(1, h.transport.to(Protocol.PATH_ACK).size(), "kick не обходит бэкофф и Retry-After");
        assertEquals(1, h.transport.to(Protocol.PATH_CLAIM).size(), "claim до открытия гейта не выполняется");
        assertEquals(2, h.engine.status().outbox());
        assertTrue(h.scheduler.lastDelay >= 29_000, "остаток гейта, а не нулевая задержка: " + h.scheduler.lastDelay);

        h.now.addAndGet(32_000);
        h.engine.cycle();
        List<Req> acks = h.transport.to(Protocol.PATH_ACK);
        assertEquals(2, acks.size());
        assertEquals(2, results(acks.get(1)).size(), "обе записи уходят одной пачкой");
        assertEquals(0, h.engine.status().outbox());
    }

    @Test
    void ack503_gateIsSharedWithClaim() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(500, job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1)));
        h.transport.thenResponse(new Transport.Response(503, "20", null, "{\"error\":\"unavailable\"}"));
        h.transport.then(ackAll("accepted", null));
        h.engine.cycle();
        h.runMain();
        h.scheduler.drain(); // ack: 503, гейт 20 с
        h.now.addAndGet(5_000); // pollAfterMs (500 мс) давно истёк, но гейт ack ещё закрыт
        h.engine.cycle();
        assertEquals(2, h.transport.requests.size(), "ни ack, ни claim во время бэкоффа");
        h.now.addAndGet(20_000);
        h.engine.cycle();
        assertEquals(0, h.engine.status().outbox());
    }

    @Test
    void ackFatalStatusesOtherThanBadRequest_keepQueueAndRetryAfterPause() throws IOException {
        for (int status : new int[] {403, 404, 302, 413}) {
            Harness h = new Harness();
            try {
                h.engine.enqueueAck(new DeliveryProtocol.Job("cjob00000001", TOKEN1, "k1:1", "give Steve diamond 1"),
                        DeliveryProtocol.AckStatus.DONE, null);
                h.transport.thenResponse(new Transport.Response(status, null, null, "{\"error\":\"site_refused\"}"));
                h.transport.then(ackAll("accepted", null));

                h.engine.cycle();
                assertEquals(1, h.engine.status().outbox(), "очередь сохранена при HTTP " + status);
                assertEquals(300_000, h.scheduler.lastDelay);
                assertTrue(h.engine.status().pausedForMs() > 0);

                h.now.addAndGet(10_000);
                h.engine.cycle();
                assertEquals(1, h.transport.to(Protocol.PATH_ACK).size(), "во время паузы запросов нет");

                h.now.addAndGet(300_000);
                h.engine.cycle();
                assertEquals(2, h.transport.to(Protocol.PATH_ACK).size(), "после паузы тот же ack повторён");
                assertEquals(0, h.engine.status().outbox());
            } finally {
                h.store.close();
            }
        }
    }

    @Test
    void ackBadRequestAndUnprocessable_retryTwiceThenDropTheBatch() throws IOException {
        for (int status : new int[] {400, 422}) {
            Harness h = new Harness();
            try {
                h.engine.enqueueAck(new DeliveryProtocol.Job("cjob00000001", TOKEN1, "k1:1", "give Steve diamond 1"),
                        DeliveryProtocol.AckStatus.DONE, null);
                for (int i = 0; i < 3; i++) {
                    h.transport.thenResponse(new Transport.Response(status, null, null, "{\"error\":\"validation_failed\"}"));
                }
                h.engine.cycle();
                assertEquals(1, h.engine.status().outbox(), "первый отказ HTTP " + status + ": пачка остаётся для повтора");
                h.now.addAndGet(60_000);
                h.engine.cycle();
                assertEquals(1, h.engine.status().outbox(), "второй отказ: пачка всё ещё остаётся");
                h.now.addAndGet(60_000);
                h.engine.cycle();
                assertEquals(0, h.engine.status().outbox(), "после двух повторов пачка отброшена при HTTP " + status);
                assertEquals(3, h.transport.to(Protocol.PATH_ACK).size());
                assertTrue(h.logs.text.toString().contains("Пачка ack отброшена"));
                h.assertNoSecretsLogged();
            } finally {
                h.store.close();
            }
        }
    }

    @Test
    void ackBadRequestOnce_thenAccepted_keepsTheBatchDelivered() throws IOException {
        Harness h = new Harness();
        try {
            h.engine.enqueueAck(new DeliveryProtocol.Job("cjob00000001", TOKEN1, "k1:1", "give Steve diamond 1"),
                    DeliveryProtocol.AckStatus.DONE, null);
            h.transport.thenResponse(new Transport.Response(400, null, null, "{\"error\":\"validation_failed\"}"));
            h.transport.then(ackAll("accepted", null));
            h.transport.thenResponse(claimResponse(2000));
            h.engine.cycle();
            assertEquals(1, h.engine.status().outbox());
            h.now.addAndGet(60_000);
            h.engine.cycle();
            assertEquals(0, h.engine.status().outbox());
            assertFalse(h.logs.text.toString().contains("Пачка ack отброшена"));
        } finally {
            h.store.close();
        }
    }

    @Test
    void noClaimWhileJobsInFlight() throws IOException {
        Harness h = new Harness();
        try {
            h.transport.thenResponse(claimResponse(1000, job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1)));
            h.transport.thenResponse(claimResponse(1000)); // не должен быть запрошен
            h.engine.cycle();
            assertEquals(1, h.engine.status().inFlight(), "команда ждёт главного потока");
            h.now.addAndGet(60_000); // pollAfterMs давно прошёл
            h.engine.cycle();
            h.engine.cycle();
            assertEquals(1, h.transport.to(Protocol.PATH_CLAIM).size(), "claim при inFlight>0 не делается");
            h.runMain();
            assertEquals(0, h.engine.status().inFlight());
        } finally {
            h.store.close();
        }
    }

    @Test
    void journalWriteFailure_returnsRetry_andStopsFurtherClaims() throws IOException {
        BrokenStore broken = new BrokenStore();
        Harness h = new Harness(broken, 5);
        h.transport.thenResponse(claimResponse(2000, job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1)));
        h.transport.then(ackAll("accepted", null));

        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        assertTrue(h.dispatched.isEmpty(), "без записи в журнал команда не выполняется");
        Req ack = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("retry", statusOf(ack, 0));
        assertEquals("store_unavailable", codeOf(ack, 0));

        h.now.addAndGet(10_000);
        h.engine.cycle();
        assertEquals(2, h.transport.requests.size(), "новых claim нет, пока журнал недоступен");
    }

    @Test
    void corruptJournal_blocksClaims_untilOperatorAcknowledges() throws IOException {
        java.nio.file.Files.writeString(dir.resolve(FileKeyStore.LOG_NAME), "garbage line\n", StandardCharsets.UTF_8);
        Harness h = new Harness();
        try {
            assertTrue(h.store.corruptionPending());
            h.engine.cycle();
            assertEquals(0, h.transport.requests.size(), "при порче журнала claim не выполняется");
            assertEquals(30_000, h.scheduler.lastDelay);
            assertTrue(h.logs.text.toString().contains("ackcorrupt"));

            assertTrue(h.store.acknowledgeCorruption());
            h.transport.thenResponse(claimResponse(2000));
            h.engine.cycle();
            assertEquals(1, h.transport.to(Protocol.PATH_CLAIM).size(), "после подтверждения опрос возобновляется");
        } finally {
            h.store.close();
        }
    }

    @Test
    void shutdown_returnsUnstartedJobsAsRetry_andLateMainTasksDoNothing() throws IOException {
        Harness h = new Harness();
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1),
                job("cjob00000002", "item2:1", "give Alex diamond 1", TOKEN2)));
        h.transport.then(ackAll("accepted", null));
        h.engine.cycle();
        assertEquals(2, h.mainQueue.size());

        h.engine.shutdown(); // главный поток ещё не успел начать задания

        Req ack = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("retry", statusOf(ack, 0));
        assertEquals("plugin_shutdown", codeOf(ack, 0));
        assertEquals("retry", statusOf(ack, 1));
        assertTrue(h.scheduler.shutdown);

        h.runMain();
        assertTrue(h.dispatched.isEmpty(), "после остановки команды не выполняются");
        assertEquals(KeyStore.State.NONE, h.store.state("item1:1"));
    }

    @Test
    void mainThreadUnavailable_returnsRetry() throws IOException {
        Harness h = new Harness();
        h.mainRejects = true;
        h.transport.thenResponse(claimResponse(2000, job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1)));
        h.transport.then(ackAll("accepted", null));
        h.engine.cycle();
        assertEquals(0, h.engine.status().inFlight());
        h.engine.cycle();
        Req ack = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals("retry", statusOf(ack, 0));
        assertTrue(h.dispatched.isEmpty());
    }

    @Test
    void moreJobsThanRequested_extraReturnedAsRetry() throws IOException {
        Harness h = new Harness(null, 2);
        h.transport.thenResponse(claimResponse(2000,
                job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1),
                job("cjob00000002", "item2:1", "give Alex diamond 1", TOKEN2),
                job("cjob00000003", "item3:1", "give Bob diamond 1", TOKEN3)));
        h.transport.then(ackAll("accepted", null));
        h.engine.cycle();
        h.runMain();
        h.scheduler.drain();
        assertEquals(2, h.dispatched.size());
        Req ack = h.transport.to(Protocol.PATH_ACK).get(0);
        assertEquals(3, results(ack).size());
        boolean found = false;
        for (int i = 0; i < 3; i++) {
            if ("too_many_jobs".equals(codeOf(ack, i))) {
                assertEquals("retry", statusOf(ack, i));
                found = true;
            }
        }
        assertTrue(found);
    }

    @Test
    void journalSurvivesRestartAndBlocksDoubleDelivery() throws IOException {
        Harness first = new Harness();
        first.transport.thenResponse(claimResponse(2000, job("cjob00000001", "item1:1", "give Steve diamond 1", TOKEN1)));
        first.transport.then(req -> new IOException("ack lost")); // сервер выполнил, но ack потерян, затем рестарт
        first.engine.cycle();
        first.runMain();
        first.scheduler.drain();
        assertEquals(1, first.dispatched.size());
        first.store.close();

        Harness second = new Harness(); // новый запуск плагина, та же папка
        second.transport.thenResponse(claimResponse(2000, job("cjob00000009", "item1:1", "give Steve diamond 1", TOKEN2)));
        second.transport.then(ackAll("accepted", null));
        second.engine.cycle();
        second.runMain();
        second.scheduler.drain();
        assertTrue(second.dispatched.isEmpty(), "после рестарта тот же ключ не выполняется повторно");
        assertEquals("done", statusOf(second.transport.to(Protocol.PATH_ACK).get(0), 0));
        second.store.close();
    }
}
