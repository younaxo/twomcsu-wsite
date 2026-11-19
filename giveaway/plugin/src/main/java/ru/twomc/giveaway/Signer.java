package ru.twomc.giveaway;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Подпись запроса по ADR-G001: HMAC-SHA256 от каноничной строки. */
public final class Signer {
    private static final SecureRandom RANDOM = new SecureRandom();

    private Signer() {}

    public static String sha256Hex(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String canonical(String keyId, String timestamp, String nonce, String method, String path, byte[] body) {
        return String.join("\n", Protocol.SIGNATURE_PREFIX, keyId, timestamp, nonce, method, path, sha256Hex(body));
    }

    public static String sign(byte[] key, String keyId, String timestamp, String nonce, String method, String path, byte[] body) {
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

    /** 16 случайных байт из SecureRandom, base64url без «=»: 22 символа. */
    public static String newNonce() {
        byte[] raw = new byte[16];
        RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    public static String formatKeyId(String serverId, int version) {
        return serverId + "." + version;
    }
}
