package ru.twomc.giveaway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class EventQueueTest {
    private static final Logger LOG = Logger.getLogger("test");
    private static final UUID U = UUID.fromString("069a79f4-44e9-4726-a5be-fca90e38aaf5");
    private static final String ID = "11111111-2222-4333-8444-555555555555";

    @TempDir
    Path dir;

    private EventQueue newQueue(int max) {
        return new EventQueue(dir, max, LOG);
    }

    @Test
    void survivesRestart() {
        EventQueue q = newQueue(100);
        GiveawayEvent a = GiveawayEvent.join(U, "Notch", 1_000);
        GiveawayEvent b = GiveawayEvent.heartbeat(U, "Notch", 61_000, true);
        GiveawayEvent c = GiveawayEvent.quit(U, "Notch", 121_000);
        q.enqueue(a);
        q.enqueue(b);
        q.enqueue(c);
        q.flush();

        EventQueue restored = newQueue(100);
        restored.load();
        assertEquals(List.of(a, b, c), restored.peek(10));
    }

    @Test
    void ackRemovesFromMemoryAndFile() throws IOException {
        EventQueue q = newQueue(100);
        GiveawayEvent a = GiveawayEvent.join(U, "Notch", 1_000);
        GiveawayEvent b = GiveawayEvent.heartbeat(U, "Notch", 61_000, false);
        q.enqueue(a);
        q.enqueue(b);
        q.flush();
        q.ack(List.of(a));
        assertEquals(List.of(b), q.peek(10));

        EventQueue restored = newQueue(100);
        restored.load();
        assertEquals(List.of(b), restored.peek(10));
        assertFalse(Files.readString(dir.resolve("queue.log")).contains(a.eventId()));
    }

    @Test
    void notAckedEventsStayAfterRestart() {
        EventQueue q = newQueue(100);
        q.enqueue(GiveawayEvent.join(U, "Notch", 1_000));
        q.flush();
        EventQueue restored = newQueue(100);
        restored.load();
        assertEquals(1, restored.size());
    }

    @Test
    void unflushedEventsAreWrittenByAckRewrite() {
        EventQueue q = newQueue(100);
        GiveawayEvent a = GiveawayEvent.join(U, "Notch", 1_000);
        GiveawayEvent b = GiveawayEvent.quit(U, "Notch", 2_000);
        q.enqueue(a);
        q.flush();
        q.enqueue(b);
        q.ack(List.of(a));
        q.flush();
        EventQueue restored = newQueue(100);
        restored.load();
        assertEquals(List.of(b), restored.peek(10));
    }

    @Test
    void purgesEventsOlderThanLimit() {
        EventQueue q = newQueue(100);
        long now = 1_000_000_000L;
        GiveawayEvent old = GiveawayEvent.join(U, "Notch", now - Protocol.MAX_EVENT_AGE.toMillis() - 1);
        GiveawayEvent fresh = GiveawayEvent.join(U, "Notch", now - 1000);
        q.enqueue(old);
        q.enqueue(fresh);
        assertEquals(1, q.purgeOlderThan(now, Protocol.MAX_EVENT_AGE.toMillis()));
        assertEquals(List.of(fresh), q.peek(10));
        assertEquals(1, q.droppedExpired());
    }

    @Test
    void deadLetterMovesBatchToSeparateFile() throws IOException {
        EventQueue q = newQueue(100);
        GiveawayEvent a = GiveawayEvent.join(U, "Notch", 1_000);
        q.enqueue(a);
        q.flush();
        q.deadLetter(List.of(a), "http_422");
        assertEquals(0, q.size());
        String dl = Files.readString(dir.resolve("dead-letter.log"));
        assertTrue(dl.contains(a.eventId()) && dl.contains("http_422"));
        EventQueue restored = newQueue(100);
        restored.load();
        assertEquals(0, restored.size());
    }

    @Test
    void deadLetterRotatesAndStaysUnderLimit() throws IOException {
        EventQueue q = new EventQueue(dir, 100, LOG, 1000, 2_000L, System::currentTimeMillis);
        for (int i = 0; i < 40; i++) {
            GiveawayEvent e = GiveawayEvent.join(U, "Notch", 1_000 + i);
            q.enqueue(e);
            q.deadLetter(List.of(e), "http_422");
        }
        long main = Files.size(dir.resolve("dead-letter.log"));
        assertTrue(Files.exists(dir.resolve("dead-letter.log.1")));
        long old = Files.size(dir.resolve("dead-letter.log.1"));
        assertTrue(main + old <= 2_000L, "total " + (main + old));
        assertEquals(40, q.deadLettered());
    }

    @Test
    void ackAppendsTombstonesAndCompactsInBatches() throws IOException {
        EventQueue q = new EventQueue(dir, 1000, LOG, 5, EventQueue.DEAD_LETTER_MAX_BYTES, System::currentTimeMillis);
        List<GiveawayEvent> all = new java.util.ArrayList<>();
        for (int i = 0; i < 20; i++) {
            GiveawayEvent e = GiveawayEvent.heartbeat(U, "Notch", 1_000L + i, true);
            all.add(e);
            q.enqueue(e);
        }
        q.flush();
        long sizeBefore = Files.size(dir.resolve("queue.log"));
        q.ack(all.subList(0, 2)); // ниже порога: файл не переписан, есть надгробия
        assertEquals(sizeBefore, Files.size(dir.resolve("queue.log")));
        assertTrue(Files.exists(dir.resolve("queue.ack")));
        EventQueue restored = new EventQueue(dir, 1000, LOG);
        restored.load();
        assertEquals(all.subList(2, 20), restored.peek(100)); // acked не воскресают

        q.ack(all.subList(2, 14)); // порог достигнут: компакция
        assertTrue(Files.size(dir.resolve("queue.log")) < sizeBefore);
        assertFalse(Files.exists(dir.resolve("queue.ack")));
        EventQueue r2 = new EventQueue(dir, 1000, LOG);
        r2.load();
        assertEquals(all.subList(14, 20), r2.peek(100));
    }

    @Test
    void overflowWarningIsRateLimited() {
        java.util.concurrent.atomic.AtomicLong t = new java.util.concurrent.atomic.AtomicLong(1_000_000L);
        java.util.List<String> logs = new java.util.ArrayList<>();
        Logger lg = Logger.getAnonymousLogger();
        lg.setUseParentHandlers(false);
        lg.addHandler(new java.util.logging.Handler() {
            public void publish(java.util.logging.LogRecord r) { logs.add(r.getMessage()); }
            public void flush() {}
            public void close() {}
        });
        EventQueue q = new EventQueue(dir, 1, lg, 1000, EventQueue.DEAD_LETTER_MAX_BYTES, t::get);
        q.enqueue(GiveawayEvent.join(U, "Notch", 1));
        for (int i = 0; i < 5; i++) q.enqueue(GiveawayEvent.join(U, "Notch", 2 + i));
        assertEquals(1, logs.size());
        t.addAndGet(EventQueue.OVERFLOW_WARN_MS);
        q.enqueue(GiveawayEvent.join(U, "Notch", 9));
        assertEquals(2, logs.size());
        assertTrue(logs.get(1).contains("ПЕРЕПОЛНЕНА"));
    }

    @Test
    void corruptLinesGoToDeadLetterOnLoad() throws IOException {
        GiveawayEvent a = GiveawayEvent.join(U, "Notch", 1_000);
        Files.writeString(dir.resolve("queue.log"), "garbage\n" + a.toLine() + "\n", StandardCharsets.UTF_8);
        EventQueue q = newQueue(100);
        q.load();
        assertEquals(List.of(a), q.peek(10));
        assertEquals(1, q.corruptLines());
        assertTrue(Files.readString(dir.resolve("dead-letter.log")).contains("garbage"));
    }

    @Test
    void overflowDropsNewEvents() {
        EventQueue q = newQueue(2);
        assertTrue(q.enqueue(GiveawayEvent.join(U, "Notch", 1)));
        assertTrue(q.enqueue(GiveawayEvent.join(U, "Notch", 2)));
        assertFalse(q.enqueue(GiveawayEvent.join(U, "Notch", 3)));
        assertEquals(2, q.size());
        assertEquals(1, q.droppedOverflow());
    }

    @Test
    void lineRoundTripAndRejectsBadLines() {
        GiveawayEvent h = GiveawayEvent.heartbeat(U, "Steve_1", 1_795_000_000_123L, true);
        assertEquals(h, GiveawayEvent.fromLine(h.toLine()));
        assertNull(GiveawayEvent.fromLine("a\tb"));
        assertNull(GiveawayEvent.fromLine(h.toLine().replace("Steve_1", "bad name")));
        assertNull(GiveawayEvent.fromLine(GiveawayEvent.join(U, "Notch", 1).toLine().replace("\t-", "\t1")));
    }

    @Test
    void jsonMatchesContract() {
        GiveawayEvent j = new GiveawayEvent(ID, GiveawayEvent.Type.JOIN, U, "Notch",
                Instant.parse("2026-11-22T10:00:05.123Z").toEpochMilli(), null);
        assertEquals("{\"eventId\":\"" + ID + "\",\"type\":\"join\",\"playerUuid\":\""
                + U + "\",\"playerName\":\"Notch\",\"occurredAt\":\"2026-11-22T10:00:05.123Z\"}", j.toJson());
        GiveawayEvent h = new GiveawayEvent(ID, GiveawayEvent.Type.HEARTBEAT, U, "Notch",
                Instant.parse("2026-11-22T10:00:05Z").toEpochMilli(), false);
        assertTrue(h.toJson().endsWith("\"occurredAt\":\"2026-11-22T10:00:05.000Z\",\"active\":false}"));
        assertTrue(GiveawayEvent.batchJson(List.of(j, h)).startsWith("{\"schema\":\"twomc.giveaway.v1\",\"events\":[{"));
    }
}
