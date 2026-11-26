package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class BackoffAndConfigTest {
    private static final String HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    @TempDir
    Path dir;

    // ---- Backoff ----

    @Test
    void backoffGrowsAndIsCapped() {
        long d1 = Backoff.delayMs(1, null, () -> 0.5);
        long d2 = Backoff.delayMs(2, null, () -> 0.5);
        long d5 = Backoff.delayMs(5, null, () -> 0.5);
        long d50 = Backoff.delayMs(50, null, () -> 0.5);
        assertEquals(2000, d1);
        assertEquals(4000, d2);
        assertEquals(32000, d5);
        assertTrue(d50 <= (long) (Backoff.MAX_MS * 1.2));
        assertTrue(d50 >= (long) (Backoff.MAX_MS * 0.8));
    }

    @Test
    void retryAfterIsNeverShortened() {
        assertTrue(Backoff.delayMs(1, 30L, () -> 0.0) >= 30_000);
        assertTrue(Backoff.delayMs(1, 30L, () -> 1.0) <= 33_000);
        assertEquals(300_000, Backoff.delayMs(1, 99999L, () -> 0.0)); // потолок 300 с
    }

    @Test
    void retryAfterParsing() {
        assertEquals(30L, Backoff.parseRetryAfter(" 30 "));
        assertNull(Backoff.parseRetryAfter("0"));
        assertNull(Backoff.parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"));
        assertNull(Backoff.parseRetryAfter(null));
    }

    // ---- BridgeConfig ----

    private BridgeConfig.Raw raw(String url, String keyId, String keyFile) {
        return new BridgeConfig.Raw(url, keyId, keyFile, List.of(), 5, 180);
    }

    @Test
    void resolvesFromKeyFile() throws IOException {
        Files.writeString(dir.resolve("bridge-key.txt"), HEX + "\n");
        BridgeConfig.Result r = BridgeConfig.resolve(raw("https://example.invalid/", "survival.1", "bridge-key.txt"), Map.of(), dir);
        assertTrue(r.ok(), r.problem());
        assertEquals("https://example.invalid", r.config().base.toString());
        assertEquals("survival.1", r.config().keyId);
        assertEquals(32, r.config().key().length);
        assertFalse(r.config().toString().contains(HEX));
    }

    @Test
    void envOverridesAndKeyHexEnvWins() throws IOException {
        Files.writeString(dir.resolve("k.txt"), "ff".repeat(32));
        Map<String, String> env = Map.of("TWOMC_BRIDGE_URL", "https://site.invalid", "TWOMC_BRIDGE_KEY_ID", "lobby.2",
                "TWOMC_BRIDGE_KEY_HEX", HEX);
        BridgeConfig.Result r = BridgeConfig.resolve(raw("https://other.invalid", "survival.1", "k.txt"), env, dir);
        assertTrue(r.ok(), r.problem());
        assertEquals("lobby.2", r.config().keyId);
        assertEquals("site.invalid", r.config().base.getHost());
        assertEquals((byte) 0x00, r.config().key()[0]);
        assertEquals((byte) 0x01, r.config().key()[1]);
    }

    @Test
    void problemsAreReportedWithoutSecretValue() throws IOException {
        assertFalse(BridgeConfig.resolve(raw("", "survival.1", "k"), Map.of(), dir).ok());
        assertFalse(BridgeConfig.resolve(raw("https://a.invalid", "", "k"), Map.of(), dir).ok());
        assertFalse(BridgeConfig.resolve(raw("https://a.invalid", "Survival.1", "k"), Map.of(), dir).ok());
        assertFalse(BridgeConfig.resolve(raw("https://a.invalid", "survival", "k"), Map.of(), dir).ok());
        assertFalse(BridgeConfig.resolve(raw("https://a.invalid", "survival.1", ""), Map.of(), dir).ok());
        BridgeConfig.Result missing = BridgeConfig.resolve(raw("https://a.invalid", "survival.1", "nope.txt"), Map.of(), dir);
        assertFalse(missing.ok());

        Files.writeString(dir.resolve("short.txt"), "SECRETVALUE123");
        BridgeConfig.Result shortKey = BridgeConfig.resolve(raw("https://a.invalid", "survival.1", "short.txt"), Map.of(), dir);
        assertFalse(shortKey.ok());
        assertFalse(shortKey.problem().contains("SECRETVALUE123"));
    }

    @Test
    void urlRules() {
        assertEquals("https://a.invalid:8443", BridgeConfig.buildBase("https://a.invalid:8443").toString());
        assertEquals("http://localhost:4000", BridgeConfig.buildBase("http://localhost:4000").toString());
        assertThrows(IllegalArgumentException.class, () -> BridgeConfig.buildBase("http://a.invalid"));
        assertThrows(IllegalArgumentException.class, () -> BridgeConfig.buildBase("https://a.invalid/api"));
        assertThrows(IllegalArgumentException.class, () -> BridgeConfig.buildBase("https://a.invalid/?x=1"));
        assertThrows(IllegalArgumentException.class, () -> BridgeConfig.buildBase("https://user:pw@a.invalid"));
        assertThrows(IllegalArgumentException.class, () -> BridgeConfig.buildBase("ftp://a.invalid"));
        assertThrows(IllegalArgumentException.class, () -> BridgeConfig.buildBase("not a url"));
    }

    @Test
    void limitsValidated() {
        Map<String, String> env = Map.of("TWOMC_BRIDGE_KEY_HEX", HEX);
        assertFalse(BridgeConfig.resolve(new BridgeConfig.Raw("https://a.invalid", "s1.1", "", List.of(), 0, 180), env, dir).ok());
        assertFalse(BridgeConfig.resolve(new BridgeConfig.Raw("https://a.invalid", "s1.1", "", List.of(), 11, 180), env, dir).ok());
        assertFalse(BridgeConfig.resolve(new BridgeConfig.Raw("https://a.invalid", "s1.1", "", List.of(), 5, 30), env, dir).ok());
        assertFalse(BridgeConfig.resolve(new BridgeConfig.Raw("https://a.invalid", "s1.1", "", List.of("op"), 5, 180), env, dir).ok());
        BridgeConfig.Result ok = BridgeConfig.resolve(new BridgeConfig.Raw("https://a.invalid", "s1.1", "", List.of("bank"), 10, 60), env, dir);
        assertTrue(ok.ok(), ok.problem());
        assertNotNull(ok.config());
        assertNull(ok.problem());
        assertTrue(ok.config().policy.roots().contains("bank"));
    }
}
