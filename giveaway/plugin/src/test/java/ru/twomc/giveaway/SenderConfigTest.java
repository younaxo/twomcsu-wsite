package ru.twomc.giveaway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SenderConfigTest {
    private static final String HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    @TempDir
    Path dir;

    @Test
    void endpointAddsFixedPath() {
        assertEquals(URI.create("https://twomc.example/api/giveaway/v1/events"), SenderConfig.buildEndpoint("https://twomc.example/"));
        assertEquals(URI.create("https://twomc.example:8443/api/giveaway/v1/events"),
                SenderConfig.buildEndpoint("https://twomc.example:8443"));
        assertEquals(URI.create("http://localhost:3001/api/giveaway/v1/events"), SenderConfig.buildEndpoint("http://localhost:3001"));
        assertThrows(IllegalArgumentException.class, () -> SenderConfig.buildEndpoint("http://twomc.example"));
        assertThrows(IllegalArgumentException.class, () -> SenderConfig.buildEndpoint("https://twomc.example/other"));
        assertThrows(IllegalArgumentException.class, () -> SenderConfig.buildEndpoint("https://twomc.example?x=1"));
        assertThrows(IllegalArgumentException.class, () -> SenderConfig.buildEndpoint("ftp://x"));
    }

    @Test
    void missingSettingsGiveOneProblemMessage() {
        SenderConfig.Result r = SenderConfig.resolve("", "", 1, "", Map.of(), dir);
        assertFalse(r.ok());
        assertTrue(r.problem().contains("apiUrl"));
    }

    @Test
    void loadsKeyFromFileAndEnvOverridesConfig() throws IOException {
        Path keyFile = dir.resolve("k.txt");
        Files.writeString(keyFile, HEX + "\n");
        SenderConfig.Result r = SenderConfig.resolve("https://a.example", "lobby-1", 1, keyFile.toString(),
                Map.of("GIVEAWAY_SERVER_ID", "survival-2", "GIVEAWAY_KEY_VERSION", "7"), dir);
        assertTrue(r.ok(), r.problem());
        assertEquals("survival-2.7", r.config().keyId);
        assertFalse(r.config().toString().contains(HEX));
    }

    @Test
    void badKeyFileIsReportedWithoutLeakingContent() throws IOException {
        Path keyFile = dir.resolve("k.txt");
        Files.writeString(keyFile, "not-a-key-secret-value");
        SenderConfig.Result r = SenderConfig.resolve("https://a.example", "lobby-1", 1, keyFile.toString(), Map.of(), dir);
        assertFalse(r.ok());
        assertFalse(r.problem().contains("secret-value"));
        assertFalse(SenderConfig.resolve("https://a.example", "lobby-1", 1, dir.resolve("none").toString(), Map.of(), dir).ok());
    }

    @Test
    void validatesServerIdAndVersion() throws IOException {
        Path keyFile = dir.resolve("k.txt");
        Files.writeString(keyFile, HEX);
        assertFalse(SenderConfig.resolve("https://a.example", "Bad_ID", 1, keyFile.toString(), Map.of(), dir).ok());
        assertFalse(SenderConfig.resolve("https://a.example", "lobby-1", 0, keyFile.toString(), Map.of(), dir).ok());
        assertFalse(SenderConfig.resolve("https://a.example", "lobby-1", 1_000_000, keyFile.toString(), Map.of(), dir).ok());
    }
}
