package ru.twomc.bridge;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;

/**
 * Подписанные запросы claim и ack. Синхронный: вызывается только из потока ввода-вывода плагина.
 * Подпись, nonce и время создаются заново на КАЖДЫЙ вызов, включая повтор той же пачки (контракт 5.1).
 */
final class BridgeApi {
    enum Kind {
        /** 200 и тело разобрано. */
        OK,
        /** 408, 429, 5xx, сетевая ошибка, нечитаемый 200: повторить ТУ ЖЕ пачку позже. */
        RETRYABLE,
        /** 401: подпись, время или nonce. */
        AUTH,
        /** Остальные 4xx: повтор не поможет (403 capability_missing, 422, 426 и т.п.). */
        FATAL
    }

    record Result<T>(Kind kind, int status, Long retryAfterSeconds, T value, String errorCode, String dateHeader) {}

    private final URI base;
    private final String keyId;
    private final byte[] key;
    private final Transport transport;
    private final LongSupplier clock;

    BridgeApi(URI base, String keyId, byte[] key, Transport transport, LongSupplier clockMillis) {
        this.base = base;
        this.keyId = keyId;
        this.key = key;
        this.transport = transport;
        this.clock = clockMillis;
    }

    Result<DeliveryProtocol.ClaimResponse> claim(int max) {
        Raw raw = post(Protocol.PATH_CLAIM, DeliveryProtocol.claimBody(max));
        return classify(raw, DeliveryProtocol::parseClaim);
    }

    Result<List<DeliveryProtocol.AckResult>> ack(List<DeliveryProtocol.AckItem> items) {
        Raw raw = post(Protocol.PATH_ACK, DeliveryProtocol.ackBody(items));
        return classify(raw, DeliveryProtocol::parseAck);
    }

    private record Raw(Transport.Response response, String networkError) {}

    private Raw post(String path, byte[] body) {
        String timestamp = Long.toString(clock.getAsLong() / 1000);
        String nonce = Signer.newNonce();
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put(Protocol.HEADER_KEY_ID, keyId);
        headers.put(Protocol.HEADER_TIMESTAMP, timestamp);
        headers.put(Protocol.HEADER_NONCE, nonce);
        headers.put(Protocol.HEADER_PROTOCOL, Protocol.PROTOCOL_VERSION);
        headers.put(Protocol.HEADER_SIGNATURE, Signer.sign(key, keyId, timestamp, nonce, Protocol.METHOD, path, body));
        try {
            URI uri = URI.create(base.toString() + path);
            return new Raw(transport.post(uri, headers, body), null);
        } catch (IOException e) {
            return new Raw(null, e.getClass().getSimpleName()); // текст исключения может содержать адрес, не берём
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Raw(null, "InterruptedException");
        }
    }

    private static <T> Result<T> classify(Raw raw, java.util.function.Function<String, T> parser) {
        if (raw.response() == null) {
            return new Result<>(Kind.RETRYABLE, 0, null, null, "network_" + raw.networkError(), null);
        }
        Transport.Response r = raw.response();
        Long retryAfter = Backoff.parseRetryAfter(r.retryAfter());
        int s = r.status();
        if (s == 200) {
            T v = parser.apply(r.body());
            return v == null
                    ? new Result<>(Kind.RETRYABLE, s, retryAfter, null, "bad_response", r.date())
                    : new Result<>(Kind.OK, s, retryAfter, v, null, r.date());
        }
        String err = DeliveryProtocol.errorCode(r.body());
        if (s == 401) {
            return new Result<>(Kind.AUTH, s, retryAfter, null, err, r.date());
        }
        if (s == 408 || s == 429 || (s >= 500 && s <= 599)) {
            return new Result<>(Kind.RETRYABLE, s, retryAfter, null, err, r.date());
        }
        return new Result<>(Kind.FATAL, s, retryAfter, null, err, r.date());
    }
}
