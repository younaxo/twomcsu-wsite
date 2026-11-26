package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Logger;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FileKeyStoreTest {
    private static final long DAY = 24L * 60 * 60 * 1000;
    private static final Logger LOG = Logger.getLogger("test-keystore");

    @TempDir
    Path dir;

    private final AtomicLong now = new AtomicLong(1_800_000_000_000L);

    private FileKeyStore open() throws IOException {
        return FileKeyStore.open(dir, now::get, 180 * DAY, LOG);
    }

    @Test
    void doneSurvivesRestart() throws IOException {
        FileKeyStore s = open();
        assertEquals(KeyStore.State.NONE, s.state("order1:1"));
        assertTrue(s.begin("order1:1"));
        assertEquals(KeyStore.State.STARTED, s.state("order1:1"));
        assertTrue(s.finish("order1:1", KeyStore.State.DONE));
        s.close();

        FileKeyStore again = open();
        assertEquals(KeyStore.State.DONE, again.state("order1:1"));
        again.close();
    }

    @Test
    void crashBetweenBeginAndFinishLeavesStartedAfterRestart() throws IOException {
        FileKeyStore s = open();
        assertTrue(s.begin("order2:1"));
        s.close(); // «падение»: исход не записан

        FileKeyStore again = open();
        assertEquals(KeyStore.State.STARTED, again.state("order2:1"));
        again.close();
    }

    @Test
    void failedIsNotBlockingAfterRestartAndIsDropped() throws IOException {
        FileKeyStore s = open();
        s.begin("order3:1");
        s.finish("order3:1", KeyStore.State.FAILED);
        assertEquals(KeyStore.State.FAILED, s.state("order3:1"));
        s.close();

        FileKeyStore again = open();
        assertEquals(KeyStore.State.NONE, again.state("order3:1"));
        again.close();
    }

    @Test
    void unknownPersistsAndForgetClearsIt() throws IOException {
        FileKeyStore s = open();
        s.begin("order4:1");
        s.finish("order4:1", KeyStore.State.UNKNOWN);
        s.close();

        FileKeyStore again = open();
        assertEquals(KeyStore.State.UNKNOWN, again.state("order4:1"));
        assertTrue(again.forget("order4:1"));
        assertEquals(KeyStore.State.NONE, again.state("order4:1"));
        again.close();

        FileKeyStore third = open();
        assertEquals(KeyStore.State.NONE, third.state("order4:1"));
        third.close();
    }

    @Test
    void doneCannotBeForgottenAndNeverDowngraded() throws IOException {
        FileKeyStore s = open();
        s.begin("order5:1");
        s.finish("order5:1", KeyStore.State.DONE);
        assertFalse(s.forget("order5:1"));
        s.close();

        // Дописанная вручную или повторная запись S/U/F не снимает DONE при чтении.
        Path log = dir.resolve(FileKeyStore.LOG_NAME);
        String extra = lineOf('S', 1_800_000_000L, "order5:1") + lineOf('U', 1_800_000_000L, "order5:1")
                + lineOf('F', 1_800_000_000L, "order5:1");
        Files.writeString(log, Files.readString(log) + extra, StandardCharsets.UTF_8);
        FileKeyStore again = open();
        assertEquals(KeyStore.State.DONE, again.state("order5:1"));
        again.close();
    }

    @Test
    void tornTailIsDiscardedAndFileIsRepaired() throws IOException {
        FileKeyStore s = open();
        s.begin("order6:1");
        s.finish("order6:1", KeyStore.State.DONE);
        s.close();

        Path log = dir.resolve(FileKeyStore.LOG_NAME);
        Files.writeString(log, Files.readString(log) + "S|1800000000|order7:1|dead", StandardCharsets.UTF_8); // без \n

        FileKeyStore again = open();
        assertTrue(again.healthy(), "оборванный хвост без \\n это норма, не порча");
        assertFalse(again.corruptionPending());
        assertEquals(KeyStore.State.DONE, again.state("order6:1"));
        assertEquals(KeyStore.State.NONE, again.state("order7:1"));
        assertTrue(again.begin("order8:1")); // дописывается на новую строку, а не склеивается с обрывком
        again.close();

        FileKeyStore third = open();
        assertEquals(KeyStore.State.STARTED, third.state("order8:1"));
        assertEquals(KeyStore.State.DONE, third.state("order6:1"));
        assertTrue(Files.readString(log).endsWith("\n"));
        third.close();
    }

    @Test
    void corruptionCopyNameIsExposedUntilAcknowledged_andOldCopiesArePruned() throws IOException {
        // 7 старых копий с меньшими метками времени: должны остаться только свежие
        for (int i = 1; i <= 7; i++) {
            Files.writeString(dir.resolve(FileKeyStore.LOG_NAME + ".bad-" + i), "old" + i);
        }
        writeCorruptLog();
        FileKeyStore s = open();
        try {
            assertTrue(s.corruptionPending());
            String copy = s.corruptionCopyName();
            assertTrue(copy != null && copy.contains(FileKeyStore.LOG_NAME + ".bad-"), "путь копии показывается оператору");
            assertTrue(Files.exists(Path.of(copy)));
            try (Stream<Path> files = Files.list(dir)) {
                long n = files.filter(p -> p.getFileName().toString().startsWith(FileKeyStore.LOG_NAME + ".bad-")).count();
                assertEquals(FileKeyStore.MAX_BAD_COPIES, n, "хранятся только последние копии .bad");
            }
            assertTrue(s.acknowledgeCorruption());
            assertEquals(null, s.corruptionCopyName());
        } finally {
            s.close();
        }
    }

    /** Журнал с одной выполненной записью и двумя повреждёнными строками в начале. */
    private Path writeCorruptLog() throws IOException {
        FileKeyStore s = open();
        s.begin("order9:1");
        s.finish("order9:1", KeyStore.State.DONE);
        s.close();
        Path log = dir.resolve(FileKeyStore.LOG_NAME);
        Files.writeString(log, "garbage line\nD|1800000000|order10:1|00000000\n" + Files.readString(log), StandardCharsets.UTF_8);
        return log;
    }

    @Test
    void corruptJournalFailsClosedUntilOperatorAcknowledges() throws IOException {
        Path log = writeCorruptLog();
        byte[] original = Files.readAllBytes(log);

        FileKeyStore again = open();
        assertFalse(again.healthy(), "порча: выдача выключена");
        assertTrue(again.corruptionPending());
        assertEquals(KeyStore.State.DONE, again.state("order9:1"));
        assertEquals(KeyStore.State.NONE, again.state("order10:1")); // неверная CRC
        assertFalse(again.begin("new:1"), "пока порча не подтверждена, begin отказывает");
        assertFalse(again.forget("order9:1"));
        assertFalse(again.finish("new:1", KeyStore.State.DONE), "finish при healthy=false ничего не пишет");
        assertArrayEquals(original, Files.readAllBytes(log), "до подтверждения файл не меняется");
        try (Stream<Path> files = Files.list(dir)) {
            assertTrue(files.anyMatch(p -> p.getFileName().toString().startsWith(FileKeyStore.LOG_NAME + ".bad-")),
                    "копия повреждённого журнала должна сохраниться");
        }
        again.close();

        FileKeyStore restarted = open(); // перезапуск без подтверждения: по-прежнему выключено
        assertFalse(restarted.healthy());
        assertTrue(restarted.corruptionPending());

        assertTrue(restarted.acknowledgeCorruption());
        assertTrue(restarted.healthy());
        assertFalse(restarted.corruptionPending());
        assertFalse(restarted.acknowledgeCorruption(), "подтверждать больше нечего");
        assertTrue(restarted.begin("new:1"));
        assertFalse(Files.readString(log).contains("garbage"), "после подтверждения журнал переписан");
        restarted.close();

        FileKeyStore third = open();
        assertTrue(third.healthy());
        assertEquals(KeyStore.State.DONE, third.state("order9:1"));
        assertEquals(KeyStore.State.STARTED, third.state("new:1"));
        third.close();
    }

    @Test
    void acknowledgeWithoutCorruptionDoesNothing() throws IOException {
        FileKeyStore s = open();
        assertFalse(s.acknowledgeCorruption());
        assertTrue(s.healthy());
        s.close();
    }

    @Test
    void finishOnUnhealthyStoreWritesNothing() throws IOException {
        FileKeyStore s = open();
        assertTrue(s.begin("w:1"));
        Path log = dir.resolve(FileKeyStore.LOG_NAME);
        byte[] before = Files.readAllBytes(log);
        s.close(); // healthy = false
        assertFalse(s.finish("w:1", KeyStore.State.DONE));
        assertArrayEquals(before, Files.readAllBytes(log));

        FileKeyStore again = open();
        assertEquals(KeyStore.State.STARTED, again.state("w:1"), "исход не записан, после рестарта ключ неизвестен");
        again.close();
    }

    @Test
    void entriesOlderThanRetentionAreCompactedAway() throws IOException {
        FileKeyStore s = open();
        s.begin("old:1");
        s.finish("old:1", KeyStore.State.DONE);
        now.addAndGet(100 * DAY);
        s.begin("mid:1");
        s.finish("mid:1", KeyStore.State.DONE);
        s.close();

        now.addAndGet(100 * DAY); // old: 200 суток (> 180), mid: 100 суток
        FileKeyStore again = open();
        assertEquals(KeyStore.State.NONE, again.state("old:1"));
        assertEquals(KeyStore.State.DONE, again.state("mid:1"));
        assertEquals(1, again.size());
        again.close();
    }

    @Test
    void compactionKeepsAllLiveEntries() throws IOException {
        FileKeyStore s = open();
        for (int i = 0; i < 300; i++) {
            s.begin("k" + i + ":1");
            s.finish("k" + i + ":1", KeyStore.State.DONE);
        }
        s.close();
        FileKeyStore again = open(); // строк 600 > 300 + 100: сжатие
        assertEquals(300, again.size());
        for (int i = 0; i < 300; i++) {
            assertEquals(KeyStore.State.DONE, again.state("k" + i + ":1"));
        }
        again.close();
        assertEquals(300, Files.readAllLines(dir.resolve(FileKeyStore.LOG_NAME)).size());
        assertFalse(Files.exists(dir.resolve(FileKeyStore.LOG_NAME + ".tmp")));
    }

    @Test
    void secondInstanceOnSameFolderIsRefused() throws IOException {
        FileKeyStore s = open();
        assertThrows(JournalBusyException.class, this::open);
        s.close();
        open().close(); // после закрытия блокировка снята
    }

    @Test
    void invalidKeyIsNotBegun() throws IOException {
        FileKeyStore s = open();
        assertFalse(s.begin("bad key|with\nnewline"));
        s.close();
    }

    @Test
    void writeAfterCloseFailsAndMarksUnhealthy() throws IOException {
        FileKeyStore s = open();
        s.close();
        assertFalse(s.begin("x:1"));
        assertFalse(s.healthy());
    }

    private static String lineOf(char type, long sec, String key) {
        String payload = type + "|" + sec + "|" + key;
        java.util.zip.CRC32 c = new java.util.zip.CRC32();
        c.update(payload.getBytes(StandardCharsets.UTF_8));
        return payload + "|" + String.format("%08x", c.getValue()) + "\n";
    }
}
