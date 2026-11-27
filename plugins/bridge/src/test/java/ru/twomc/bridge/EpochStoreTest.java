package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class EpochStoreTest {
    @TempDir
    Path dir;

    private Logger logger(DeliveryEngineTest.CapturingHandler logs) {
        Logger l = Logger.getLogger("epoch-test-" + System.nanoTime());
        l.setUseParentHandlers(false);
        l.addHandler(logs);
        return l;
    }

    @Test
    void writesViaTempFileAndReplacesExistingWithoutLeavingTemp() throws Exception {
        Path f = dir.resolve("inventory-epoch.txt");
        DeliveryEngineTest.CapturingHandler logs = new DeliveryEngineTest.CapturingHandler();
        EpochStore.write(f, 100L, logger(logs));
        EpochStore.write(f, 200L, logger(logs));
        assertEquals("200", Files.readString(f, StandardCharsets.UTF_8));
        assertFalse(Files.exists(dir.resolve("inventory-epoch.txt.tmp")), "временный файл переименован");
        assertEquals(0, logs.text.length());
    }

    @Test
    void nextIsMaxOfSavedPlusOneAndNow() {
        Path f = dir.resolve("inventory-epoch.txt");
        DeliveryEngineTest.CapturingHandler logs = new DeliveryEngineTest.CapturingHandler();
        assertEquals(1_000L, EpochStore.next(f, 1_000L, logger(logs)));
        assertEquals(1_001L, EpochStore.next(f, 500L, logger(logs)), "часы позади: сохранённая + 1");
    }

    @Test
    void writeFailureIsLoggedAndDoesNotThrow() {
        Path f = dir.resolve("no-such-dir").resolve("inventory-epoch.txt");
        DeliveryEngineTest.CapturingHandler logs = new DeliveryEngineTest.CapturingHandler();
        EpochStore.write(f, 5L, logger(logs));
        assertTrue(logs.text.toString().contains("Эпоха инвентаря не сохранена"));
    }
}
