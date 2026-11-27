package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;

/** Очередь снимков без сети и сервера: поддельные транспорт и планировщик с виртуальным временем. */
class EventPipelineTest {
    private static final String HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    private static final String KEY_ID = "survival.1";

    record Result(String key, String status, String code) {}

    final class Harness {
        final TestScheduler sch = new TestScheduler();
        final DeliveryEngineTest.FakeTransport transport = new DeliveryEngineTest.FakeTransport();
        final DeliveryEngineTest.CapturingHandler logs = new DeliveryEngineTest.CapturingHandler();
        final List<Result> results = new ArrayList<>();
        final EventPipeline pipeline;

        Harness() {
            Logger logger = Logger.getLogger("pipeline-test-" + System.nanoTime());
            logger.setUseParentHandlers(false);
            logger.addHandler(logs);
            BridgeApi api = new BridgeApi(URI.create("https://example.invalid"), KEY_ID, HexFormat.of().parseHex(HEX), transport, sch.now::get);
            pipeline = new EventPipeline(api, sch, sch.now::get, () -> 0.5, logger, "survival", "boot-test",
                    (p, st, code) -> results.add(new Result(p.key, st, code)));
        }

        EventPipeline.Pending stats(String key) {
            return new EventPipeline.Pending(EventsProtocol.TYPE_STATS, key, sch.now.get(),
                    "{\"uuid\":\"" + key + "\",\"metrics\":{\"kills\":1}}", null);
        }

        void send(EventPipeline.Pending p) {
            pipeline.submit(p);
            sch.runDue();
        }

        /** Ответ 200: для каждого события статус и код из функции (индекс события, id). */
        void answer(BiFunction<Integer, String, String[]> f) {
            transport.then(req -> {
                List<Map<String, Object>> events = events(req);
                StringBuilder sb = new StringBuilder("{\"results\":[");
                for (int i = 0; i < events.size(); i++) {
                    String id = (String) events.get(i).get("eventId");
                    String[] sc = f.apply(i, id);
                    if (i > 0) sb.append(',');
                    sb.append("{\"eventId\":\"").append(id).append("\",\"status\":\"").append(sc[0]).append('"');
                    if (sc.length > 1 && sc[1] != null) sb.append(",\"code\":\"").append(sc[1]).append('"');
                    sb.append('}');
                }
                return new Transport.Response(200, null, null, sb.append("],\"serverTime\":\"x\"}").toString());
            });
        }

        void answerAll(String status, String code) {
            answer((i, id) -> new String[] {status, code});
        }
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> events(DeliveryEngineTest.Req req) {
        return (List<Map<String, Object>>) (List<?>) MiniJson.parseObject(req.body()).get("events");
    }

    @Test
    void envelopeAndSignature() {
        Harness h = new Harness();
        h.answerAll("accepted", null);
        h.send(h.stats("a"));

        assertEquals(1, h.transport.requests.size());
        DeliveryEngineTest.Req req = h.transport.requests.get(0);
        assertEquals("/bridge/v1/events", req.path());
        Map<String, Object> body = MiniJson.parseObject(req.body());
        assertEquals(Set.of("schema", "sentAt", "events"), body.keySet());
        assertEquals("twomc.bridge.v1", body.get("schema"));
        assertTrue(((String) body.get("sentAt")).matches("^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z$"));
        Map<String, Object> ev = events(req).get(0);
        assertEquals(Set.of("eventId", "type", "serverId", "streamId", "seq", "occurredAt", "data"), ev.keySet());
        assertTrue(((String) ev.get("eventId")).matches("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"));
        assertEquals("player.stats.snapshot", ev.get("type"));
        assertEquals("survival", ev.get("serverId"));
        assertEquals("boot-test", ev.get("streamId"));
        assertEquals(1L, ev.get("seq"));

        String ts = req.headers().get(Protocol.HEADER_TIMESTAMP);
        String nonce = req.headers().get(Protocol.HEADER_NONCE);
        String expected = Signer.sign(HexFormat.of().parseHex(HEX), KEY_ID, ts, nonce, "POST", "/bridge/v1/events",
                req.body().getBytes(StandardCharsets.UTF_8));
        assertEquals(expected, req.headers().get(Protocol.HEADER_SIGNATURE));
        assertEquals("1", req.headers().get(Protocol.HEADER_PROTOCOL));
        assertEquals(List.of(new Result("a", "accepted", null)), h.results);
    }

    @Test
    void seqIsContiguousAndBatchesAreLimited() {
        Harness h = new Harness();
        h.answerAll("accepted", null);
        h.answerAll("accepted", null);
        for (int i = 0; i < 25; i++) h.pipeline.submit(h.stats("k" + i));
        h.sch.advance(1000);
        assertEquals(2, h.transport.requests.size());
        assertEquals(20, events(h.transport.requests.get(0)).size());
        assertEquals(5, events(h.transport.requests.get(1)).size());
        long expected = 1;
        for (DeliveryEngineTest.Req r : h.transport.requests) {
            for (Map<String, Object> e : events(r)) assertEquals(expected++, e.get("seq"));
        }
        assertEquals(26, expected);
    }

    @Test
    void retriesSameBatchOn503WithNewNonceAndHonorsRetryAfter() {
        Harness h = new Harness();
        h.transport.thenResponse(new Transport.Response(503, "10", null, "{\"error\":\"unavailable\"}"));
        h.answerAll("accepted", null);
        h.send(h.stats("a"));
        assertEquals(1, h.transport.requests.size());
        h.sch.advance(9_000);
        assertEquals(1, h.transport.requests.size(), "раньше Retry-After повторять нельзя");
        h.sch.advance(3_000);
        assertEquals(2, h.transport.requests.size());
        DeliveryEngineTest.Req r1 = h.transport.requests.get(0);
        DeliveryEngineTest.Req r2 = h.transport.requests.get(1);
        assertEquals(events(r1).get(0).get("eventId"), events(r2).get(0).get("eventId"));
        assertEquals(events(r1).get(0).get("seq"), events(r2).get(0).get("seq"));
        assertNotEquals(r1.headers().get(Protocol.HEADER_NONCE), r2.headers().get(Protocol.HEADER_NONCE));
        assertNotEquals(r1.headers().get(Protocol.HEADER_SIGNATURE), r2.headers().get(Protocol.HEADER_SIGNATURE));
        assertEquals(1, h.results.size());
    }

    @Test
    void retriesOnNetworkError() {
        Harness h = new Harness();
        h.transport.then(req -> new IOException("secret-host.invalid"));
        h.answerAll("accepted", null);
        h.send(h.stats("a"));
        h.sch.advance(5_000);
        assertEquals(2, h.transport.requests.size());
        assertFalse(h.logs.text.toString().contains("secret-host"), "текст сетевого исключения (адрес) не должен попадать в лог");
    }

    @Test
    void invalidDataIsLoggedAndNeverRetried() {
        Harness h = new Harness();
        h.answerAll("rejected", "invalid_data");
        h.send(h.stats("a"));
        h.sch.advance(10 * 60_000L);
        assertEquals(1, h.transport.requests.size());
        assertEquals(List.of(new Result("a", "rejected", "invalid_data")), h.results);
        assertTrue(h.logs.text.toString().contains("invalid_data"));
        assertEquals(1, h.pipeline.status().rejected());
    }

    @Test
    void conflictAndServerMismatchAreNotRetried() {
        Harness h = new Harness();
        h.answerAll("rejected", "conflict");
        h.answerAll("rejected", "server_mismatch");
        h.send(h.stats("a"));
        h.send(h.stats("b"));
        h.sch.advance(10 * 60_000L);
        assertEquals(2, h.transport.requests.size());
    }

    @Test
    void duplicateAndStaleAreFinal() {
        Harness h = new Harness();
        h.answerAll("duplicate", null);
        h.answerAll("stale", null);
        h.send(h.stats("a"));
        h.send(h.stats("b"));
        h.sch.advance(10 * 60_000L);
        assertEquals(2, h.transport.requests.size());
        assertEquals(List.of("duplicate", "stale"), h.results.stream().map(Result::status).toList());
        assertEquals(0, h.pipeline.status().rejected());
    }

    @Test
    void unsupportedTypeBlocksTheTypeForThirtyMinutes() {
        Harness h = new Harness();
        h.answerAll("rejected", "unsupported_type");
        h.send(h.stats("a"));
        assertTrue(h.pipeline.isBlocked(EventsProtocol.TYPE_STATS));
        assertFalse(h.pipeline.isBlocked(EventsProtocol.TYPE_INVENTORY));
        h.send(h.stats("b"));
        h.sch.advance(29 * 60_000L);
        assertEquals(1, h.transport.requests.size(), "пока блок действует, запросов нет");
        h.sch.advance(2 * 60_000L);
        assertFalse(h.pipeline.isBlocked(EventsProtocol.TYPE_STATS));
        h.answerAll("accepted", null);
        h.send(h.stats("c"));
        assertEquals(2, h.transport.requests.size());
    }

    @Test
    void authFailureRetriesThreeTimesThenPausesFiveMinutes() {
        Harness h = new Harness();
        for (int i = 0; i < 4; i++) {
            h.transport.thenResponse(new Transport.Response(401, null, "Fri, 27 Nov 2026 00:00:00 GMT", "{\"error\":\"unauthorized\"}"));
        }
        h.answerAll("accepted", null);
        h.send(h.stats("a"));
        assertEquals(1, h.transport.requests.size());
        h.sch.advance(2_000);
        assertEquals(2, h.transport.requests.size());
        h.sch.advance(4_000);
        assertEquals(3, h.transport.requests.size());
        h.sch.advance(8_000);
        assertEquals(4, h.transport.requests.size());
        h.sch.advance(299_000);
        assertEquals(4, h.transport.requests.size(), "после трёх повторов пауза 5 минут");
        h.sch.advance(2_000);
        assertEquals(5, h.transport.requests.size());
        assertEquals(1, h.results.size());
    }

    @Test
    void requestLevelFatalDropsBatchAndPauses() {
        Harness h = new Harness();
        h.transport.thenResponse(new Transport.Response(422, null, null, "{\"error\":\"invalid_envelope\"}"));
        h.answerAll("accepted", null);
        h.send(h.stats("a"));
        h.send(h.stats("b"));
        assertEquals(1, h.transport.requests.size());
        h.sch.advance(59_000);
        assertEquals(1, h.transport.requests.size());
        h.sch.advance(2_000);
        assertEquals(2, h.transport.requests.size());
        assertEquals(1, events(h.transport.requests.get(1)).size(), "отброшенная пачка не повторяется, ушло только новое событие");
        assertEquals(List.of("b"), h.results.stream().map(Result::key).toList());
    }

    @Test
    void newerSnapshotReplacesPendingOneWithSameKey() {
        Harness h = new Harness();
        h.answerAll("accepted", null);
        EventPipeline.Pending first = new EventPipeline.Pending(EventsProtocol.TYPE_STATS, "k", h.sch.now.get(), "{\"v\":1}", null);
        EventPipeline.Pending second = new EventPipeline.Pending(EventsProtocol.TYPE_STATS, "k", h.sch.now.get(), "{\"v\":2}", null);
        h.pipeline.submit(first);
        h.pipeline.submit(second);
        h.sch.runDue();
        List<Map<String, Object>> ev = events(h.transport.requests.get(0));
        assertEquals(1, ev.size());
        assertEquals(2L, ((Map<?, ?>) ev.get(0).get("data")).get("v"));
    }

    @Test
    void missingResultKeepsEventForRetryWithSameId() {
        Harness h = new Harness();
        h.transport.then(req -> new Transport.Response(200, null, null, "{\"results\":[],\"serverTime\":\"x\"}"));
        h.answerAll("accepted", null);
        h.send(h.stats("a"));
        h.sch.advance(5_000);
        assertEquals(2, h.transport.requests.size());
        assertEquals(events(h.transport.requests.get(0)).get(0).get("eventId"), events(h.transport.requests.get(1)).get(0).get("eventId"));
        assertEquals(1, h.results.size());
    }

    @Test
    void oldBatchIsDroppedInsteadOfRetriedForever() {
        Harness h = new Harness();
        for (int i = 0; i < 60; i++) h.transport.thenResponse(new Transport.Response(503, null, null, "{\"error\":\"unavailable\"}"));
        h.send(h.stats("a"));
        h.sch.advance(EventPipeline.MAX_RETRY_AGE_MS + 6 * 60_000L);
        int sent = h.transport.requests.size();
        h.sch.advance(30 * 60_000L);
        assertEquals(sent, h.transport.requests.size(), "после часа повторов снимок отброшен и запросов больше нет");
        assertEquals(1, h.pipeline.status().dropped());
    }

    @Test
    void queuedEventIsSentAfterExpiredBatchIsDropped() {
        Harness h = new Harness();
        // События с uuid "a" всегда получают 503, остальные принимаются.
        for (int i = 0; i < 400; i++) {
            h.transport.then(req -> {
                if (req.body().contains("\"uuid\":\"a\"")) return new Transport.Response(503, null, null, "{\"error\":\"unavailable\"}");
                StringBuilder sb = new StringBuilder("{\"results\":[");
                List<Map<String, Object>> evs = events(req);
                for (int k = 0; k < evs.size(); k++) {
                    if (k > 0) sb.append(',');
                    sb.append("{\"eventId\":\"").append(evs.get(k).get("eventId")).append("\",\"status\":\"accepted\"}");
                }
                return new Transport.Response(200, null, null, sb.append("],\"serverTime\":\"x\"}").toString());
            });
        }
        h.send(h.stats("a"));
        h.sch.advance(EventPipeline.MAX_RETRY_AGE_MS - 120_000L);
        h.send(h.stats("b")); // встаёт в очередь за пачкой "a", которая ещё повторяется
        h.sch.advance(10 * 60_000L); // "a" устарела и отброшена
        assertEquals(1, h.pipeline.status().dropped());
        assertTrue(h.transport.requests.stream().anyMatch(r -> r.body().contains("\"uuid\":\"b\"")),
                "событие из очереди отправлено без нового submit");
        assertEquals(0, h.pipeline.status().queued());
    }

    @Test
    void runtimeExceptionInPumpDoesNotStopSending() {
        Harness h = new Harness();
        h.transport.then(req -> {
            throw new IllegalStateException("boom");
        });
        h.answerAll("accepted", null);
        h.send(h.stats("a"));
        assertEquals(1, h.transport.requests.size());
        h.sch.advance(120_000L);
        assertEquals(2, h.transport.requests.size(), "после исключения отправка продолжилась той же пачкой");
        assertEquals(1, h.results.size());
        assertTrue(h.logs.text.toString().contains("IllegalStateException"));
    }

    @Test
    void authLogDoesNotContainControlCharactersFromDateHeader() {
        Harness h = new Harness();
        h.transport.thenResponse(new Transport.Response(401, null, "Fri\r\nFAKE: forged log line\u0007", "{\"error\":\"unauthorized\"}"));
        h.send(h.stats("a"));
        String all = h.logs.text.toString();
        assertFalse(all.contains("\r"));
        assertFalse(all.contains("\nFAKE"), "заголовок не может начать новую строку лога");
        assertFalse(all.contains("\u0007"));
        assertTrue(all.contains("Fri"));
    }

    @Test
    void queueIsBounded() {
        Harness h = new Harness();
        h.transport.thenResponse(new Transport.Response(503, "300", null, "{}"));
        h.pipeline.submit(h.stats("first"));
        h.sch.runDue(); // первая пачка ушла и ждёт повтора
        for (int i = 0; i < EventPipeline.MAX_QUEUED + 50; i++) h.pipeline.submit(h.stats("k" + i));
        h.sch.runDue();
        assertTrue(h.pipeline.status().queued() <= EventPipeline.MAX_QUEUED);
        assertEquals(50, h.pipeline.status().dropped());
    }

    @Test
    void noSecretOrSignatureInLogs() {
        Harness h = new Harness();
        h.transport.thenResponse(new Transport.Response(401, null, null, "{\"error\":\"unauthorized\"}"));
        h.send(h.stats("a"));
        String all = h.logs.text.toString();
        assertFalse(all.contains(HEX));
        assertFalse(all.contains(h.transport.requests.get(0).headers().get(Protocol.HEADER_SIGNATURE)));
    }
}
