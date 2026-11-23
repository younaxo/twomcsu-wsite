package ru.twomc.giveaway;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.LongSupplier;

/**
 * Подписанные вызовы фазы 2: POST /redeem и POST /progress (ADR-G002 п. 6, подпись по ADR-G001).
 * Вызывается ТОЛЬКО из асинхронного потока. Код и подпись не логируются; ошибки возвращаются как RETRY_LATER или пустой результат.
 */
public final class GiveawayApi {
    private final SenderConfig config; // null, если отправка не настроена
    private final BatchSender.Transport transport;
    private final LongSupplier clock;

    public GiveawayApi(SenderConfig config, BatchSender.Transport transport, LongSupplier clock) {
        this.config = config;
        this.transport = transport;
        this.clock = clock;
    }

    public boolean configured() { return config != null; }

    /** Тело POST /redeem; code уже нормализован (только 0-9A-Z), ник проверен вызывающим. */
    static String redeemBody(String normalizedCode, UUID uuid, String name) {
        return "{\"code\":\"" + normalizedCode + "\",\"playerUuid\":\"" + uuid + "\",\"playerName\":\"" + name + "\"}";
    }

    /** Тело POST /progress. */
    static String progressBody(List<UUID> uuids) {
        StringBuilder sb = new StringBuilder("{\"uuids\":[");
        for (int i = 0; i < uuids.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(uuids.get(i)).append('"');
        }
        return sb.append("]}").toString();
    }

    public RedeemResult redeem(String normalizedCode, UUID uuid, String name) {
        if (config == null || normalizedCode == null || !GiveawayEvent.isValidName(name)) return RedeemResult.RETRY;
        try {
            BatchSender.Response r = post(Protocol.REDEEM_PATH, redeemBody(normalizedCode, uuid, name));
            return RedeemResult.parse(r.status(), r.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return RedeemResult.RETRY;
        } catch (IOException | RuntimeException e) {
            return RedeemResult.RETRY;
        }
    }

    /** Результат опроса: ok=false при сети, не-200 или неразборчивом теле; players пуст в этом случае. */
    public record ProgressOutcome(boolean ok, Map<UUID, PlayerProgress> players, String error, SiteInfo site) {}

    public ProgressOutcome progress(List<UUID> uuids) {
        if (config == null) return new ProgressOutcome(false, Map.of(), "not_configured", null);
        if (uuids.isEmpty() || uuids.size() > Protocol.MAX_PROGRESS_UUIDS) return new ProgressOutcome(false, Map.of(), "bad_batch", null);
        try {
            BatchSender.Response r = post(Protocol.PROGRESS_PATH, progressBody(uuids));
            if (r.status() != 200) return new ProgressOutcome(false, Map.of(), "http " + r.status(), null);
            Map<String, Object> root = MiniJson.parseObject(r.body());
            if (root == null || !(root.get("players") instanceof List<?>)) return new ProgressOutcome(false, Map.of(), "bad_response", null);
            return new ProgressOutcome(true, PlayerProgress.parse(r.status(), r.body()), "", SiteInfo.parse(r.body()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new ProgressOutcome(false, Map.of(), "interrupted", null);
        } catch (IOException | RuntimeException e) {
            return new ProgressOutcome(false, Map.of(), "network:" + e.getClass().getSimpleName(), null);
        }
    }

    private BatchSender.Response post(String path, String json) throws IOException, InterruptedException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        String timestamp = Long.toString(clock.getAsLong() / 1000L);
        String nonce = Signer.newNonce();
        String signature = Signer.sign(config.key(), config.keyId, timestamp, nonce, Protocol.METHOD, path, body);
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put(Protocol.HEADER_KEY_ID, config.keyId);
        headers.put(Protocol.HEADER_TIMESTAMP, timestamp);
        headers.put(Protocol.HEADER_NONCE, nonce);
        headers.put(Protocol.HEADER_SIGNATURE, signature);
        URI uri = config.endpointFor(path);
        return transport.post(uri, headers, body);
    }
}
