package ru.twomc.bridge;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/** Транспорт на java.net.http.HttpClient. Без редиректов: редирект сломал бы подпись и мог бы увести запрос. */
final class JdkTransport implements Transport {
    private static final int MAX_BODY = 65_536;
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .version(HttpClient.Version.HTTP_1_1)
            .build();
    private final Duration requestTimeout;

    JdkTransport(Duration requestTimeout) {
        this.requestTimeout = requestTimeout;
    }

    @Override
    public Response post(URI uri, Map<String, String> headers, byte[] body) throws IOException, InterruptedException {
        HttpRequest.Builder b = HttpRequest.newBuilder(uri)
                .timeout(requestTimeout)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body));
        headers.forEach(b::header);
        HttpResponse<InputStream> r = client.send(b.build(), HttpResponse.BodyHandlers.ofInputStream());
        String text;
        try (InputStream in = r.body()) {
            text = new String(in.readNBytes(MAX_BODY), StandardCharsets.UTF_8); // тело ограничено
        }
        return new Response(r.statusCode(), r.headers().firstValue("Retry-After").orElse(null),
                r.headers().firstValue("Date").orElse(null), text);
    }
}
