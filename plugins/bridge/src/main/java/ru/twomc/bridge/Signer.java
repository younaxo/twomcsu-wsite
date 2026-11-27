package ru.twomc.bridge;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Подпись запроса (контракт Bridge, 2.2):
 * canonical = "twomc-bridge-v1" LF key-id LF timestamp LF nonce LF METHOD LF path LF sha256hex(сырое тело);
 * signature = hex(HMAC-SHA256(ключ_сервера, canonical)). Ключ сервера уже выведен сайтом (HKDF) и выдан
 * владельцем; плагин получает готовые 32 байта и сам ничего не выводит.
 */
final class Signer {
    private static final SecureRandom RANDOM = new SecureRandom();

    private Signer() {}

    static String sha256Hex(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    static String canonical(String keyId, String timestamp, String nonce, String method, String path, byte[] body) {
        return String.join("\n", Protocol.SIGNATURE_PREFIX, keyId, timestamp, nonce, method, path, sha256Hex(body));
    }

    static String sign(byte[] key, String keyId, String timestamp, String nonce, String method, String path, byte[] body) {
        if (key == null || key.length == 0) {
            throw new IllegalArgumentException("empty key");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] out = mac.doFinal(canonical(keyId, timestamp, nonce, method, path, body).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(out);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 16 случайных байт, base64url без «=»: 22 символа (требуется 22..43). Новый на КАЖДЫЙ запрос, включая повтор. */
    static String newNonce() {
        byte[] raw = new byte[16];
        RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }
}
