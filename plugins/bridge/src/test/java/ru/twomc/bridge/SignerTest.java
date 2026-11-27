package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Эталонный вектор из контракта (BRIDGE-CONTRACT.md, 2.2) и векторы для путей claim/ack, посчитанные через
 * node:crypto по тому же алгоритму, что бэкенд (apps/api/src/modules/bridge/bridge-crypto.ts). Ключ тестовый.
 */
class SignerTest {
    private static final byte[] KEY = "example-secret-not-for-production-use-0123456789".getBytes(StandardCharsets.UTF_8);
    private static final String NONCE = "AAAAAAAAAAAAAAAAAAAAAA";
    private static final String TS = "1794916800";

    private static final String EVENTS_BODY = "{\"schema\":\"twomc.bridge.v1\",\"sentAt\":\"2026-11-17T12:00:00.000Z\",\"events\":"
            + "[{\"eventId\":\"0193f0a2-7c1e-7000-8000-000000000001\",\"type\":\"bridge.hello\",\"serverId\":\"survival\","
            + "\"streamId\":\"boot-0001\",\"seq\":1,\"occurredAt\":\"2026-11-17T12:00:00.000Z\","
            + "\"data\":{\"pluginVersion\":\"0.0.0-example\",\"platform\":\"example\"}}]}";

    @Test
    void contractVectorBodyHash() {
        assertEquals("948f3c8711ceacb9257f84d3f4037387f1a7008fd2f5239cf72c2bb4d4fd9ad5",
                Signer.sha256Hex(EVENTS_BODY.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void contractVectorSignature() {
        assertEquals("9cbc99b98b00133f034fd5d058bdaff1818f54fa3003c074d14823f2dd80c2fc",
                Signer.sign(KEY, "survival.1", TS, NONCE, "POST", "/bridge/v1/events", EVENTS_BODY.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void claimVector() {
        byte[] body = DeliveryProtocol.claimBody(5);
        assertEquals("{\"max\":5}", new String(body, StandardCharsets.UTF_8));
        assertEquals("17757150fe6a8ad9a7c02fd450ed75d5440ead4d039bf3e5f70373867eab9fc6", Signer.sha256Hex(body));
        assertEquals("fecd44a6eef88ba7ced4ce1760d1b21951cdcf7677e37a1390f3fb27d2af33fa",
                Signer.sign(KEY, "survival.1", TS, NONCE, Protocol.METHOD, Protocol.PATH_CLAIM, body));
    }

    @Test
    void ackVector() {
        DeliveryProtocol.AckItem item = new DeliveryProtocol.AckItem("cjob00000001", "00000000-0000-4000-8000-000000000001",
                DeliveryProtocol.AckStatus.DONE, null, 0);
        byte[] body = DeliveryProtocol.ackBody(java.util.List.of(item));
        assertEquals("{\"results\":[{\"jobId\":\"cjob00000001\",\"claimToken\":\"00000000-0000-4000-8000-000000000001\",\"status\":\"done\"}]}",
                new String(body, StandardCharsets.UTF_8));
        assertEquals("588222bada24f1dcd8bb560b8a89e7a3db5480e5e967ef98600843f958777f8c",
                Signer.sign(KEY, "survival.1", TS, NONCE, Protocol.METHOD, Protocol.PATH_ACK, body));
    }

    @Test
    void emptyBodyHashesEmptyString() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", Signer.sha256Hex(new byte[0]));
        assertEquals("9b2c5673dca999dd9b8874a52cea884e9792b6ebe1f756937cd210d47d52a84b",
                Signer.sign(KEY, "survival.1", TS, NONCE, Protocol.METHOD, Protocol.PATH_CLAIM, new byte[0]));
    }

    @Test
    void canonicalLayout() {
        String[] parts = Signer.canonical("survival.1", TS, NONCE, "POST", Protocol.PATH_CLAIM, new byte[0]).split("\n", -1);
        assertEquals(7, parts.length);
        assertEquals("twomc-bridge-v1", parts[0]);
        assertEquals("/bridge/v1/delivery/claim", parts[5]);
    }

    @Test
    void anyChangedInputChangesSignature() {
        byte[] body = DeliveryProtocol.claimBody(5);
        String base = Signer.sign(KEY, "survival.1", TS, NONCE, "POST", Protocol.PATH_CLAIM, body);
        assertNotEquals(base, Signer.sign(KEY, "survival.2", TS, NONCE, "POST", Protocol.PATH_CLAIM, body));
        assertNotEquals(base, Signer.sign(KEY, "survival.1", "1794916801", NONCE, "POST", Protocol.PATH_CLAIM, body));
        assertNotEquals(base, Signer.sign(KEY, "survival.1", TS, "BAAAAAAAAAAAAAAAAAAAAA", "POST", Protocol.PATH_CLAIM, body));
        assertNotEquals(base, Signer.sign(KEY, "survival.1", TS, NONCE, "POST", Protocol.PATH_ACK, body));
        assertNotEquals(base, Signer.sign(KEY, "survival.1", TS, NONCE, "POST", Protocol.PATH_CLAIM, DeliveryProtocol.claimBody(6)));
    }

    @Test
    void emptyKeyRejected() {
        assertThrows(IllegalArgumentException.class, () -> Signer.sign(new byte[0], "a.1", TS, NONCE, "POST", "/x", new byte[0]));
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
