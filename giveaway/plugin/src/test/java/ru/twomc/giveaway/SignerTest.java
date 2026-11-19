package ru.twomc.giveaway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Тестовые векторы посчитаны через node:crypto по логике бэкенда
 * (apps/api/src/modules/giveaway/giveaway-crypto.ts: buildCanonical + signRequest).
 */
class SignerTest {
    private static final byte[] KEY = HexFormat.of().parseHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
    private static final String BODY = "{\"schema\":\"twomc.giveaway.v1\",\"events\":[{\"eventId\":\"11111111-2222-4333-8444-555555555555\","
            + "\"type\":\"join\",\"playerUuid\":\"069a79f4-44e9-4726-a5be-fca90e38aaf5\",\"playerName\":\"Notch\","
            + "\"occurredAt\":\"2026-11-22T10:00:05.123Z\"}]}";
    private static final String NONCE = "AAAAAAAAAAAAAAAAAAAAAA";

    @Test
    void bodyHashMatchesNodeVector() {
        assertEquals("0d13a5f0d6373fc5fe9b6bf6c837422cf36d3862a1840907bd2aed88e5882742",
                Signer.sha256Hex(BODY.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void signatureMatchesNodeVector1() {
        String sig = Signer.sign(KEY, "survival-1.2", "1795341605", NONCE, "POST",
                Protocol.SIGN_PATH, BODY.getBytes(StandardCharsets.UTF_8));
        assertEquals("4f38abd666a48a6d79793beeb1ffb846d09a418c40388ca1d98378861f524861", sig);
    }

    @Test
    void signatureMatchesNodeVector2() {
        byte[] key = new byte[32];
        Arrays.fill(key, (byte) 0xab);
        String sig = Signer.sign(key, "lobby-2.17", "1700000000", "abcDEF123_-abcDEF123_-x", "POST",
                Protocol.SIGN_PATH, "{\"schema\":\"twomc.giveaway.v1\",\"events\":[]}".getBytes(StandardCharsets.UTF_8));
        assertEquals("008ae861ed00019a082b92aafcd56c4523bba5fe99deecaf1dd3a848c9b7bda0", sig);
    }

    @Test
    void canonicalHasExactLayout() {
        String c = Signer.canonical("a-1.1", "1700000000", "n".repeat(22), "POST", Protocol.SIGN_PATH, new byte[0]);
        String[] parts = c.split("\n", -1);
        assertEquals(7, parts.length);
        assertEquals("twomc-giveaway-v1", parts[0]);
        assertEquals("/api/giveaway/v1/events", parts[5]);
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", parts[6]);
    }

    @Test
    void anyChangedInputChangesSignature() {
        byte[] body = BODY.getBytes(StandardCharsets.UTF_8);
        String base = Signer.sign(KEY, "survival-1.2", "1795341605", NONCE, "POST", Protocol.SIGN_PATH, body);
        byte[] changed = body.clone();
        changed[10] ^= 1;
        assertNotEquals(base, Signer.sign(KEY, "survival-1.2", "1795341605", NONCE, "POST", Protocol.SIGN_PATH, changed));
        assertNotEquals(base, Signer.sign(KEY, "survival-1.3", "1795341605", NONCE, "POST", Protocol.SIGN_PATH, body));
        assertNotEquals(base, Signer.sign(KEY, "survival-1.2", "1795341606", NONCE, "POST", Protocol.SIGN_PATH, body));
    }

    @Test
    void noncesAreUniqueAndWellFormed() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 2000; i++) {
            String n = Signer.newNonce();
            assertTrue(n.matches("^[A-Za-z0-9_-]{22,43}$"), n);
            assertTrue(seen.add(n));
        }
    }
}
