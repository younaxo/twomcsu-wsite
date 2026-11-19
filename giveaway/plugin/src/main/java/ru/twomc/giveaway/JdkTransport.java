package ru.twomc.giveaway;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/** Транспорт на java.net.http.HttpClient. Вызывается только из асинхронного потока. */
public final class JdkTransport implements BatchSender.Transport {
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER) // редирект сломал бы подпись и мог бы увести запрос
            .version(HttpClient.Version.HTTP_1_1)
            .build();

    @Override
    public BatchSender.Response post(URI uri, Map<String, String> headers, byte[] body) throws IOException, InterruptedException {
        HttpRequest.Builder b = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(20))
                .POST(HttpRequest.BodyPublishers.ofByteArray(body));
        headers.forEach(b::header);
        HttpResponse<java.io.InputStream> r = client.send(b.build(), HttpResponse.BodyHandlers.ofInputStream());
        String text = null;
        try (java.io.InputStream in = r.body()) {
            if (r.statusCode() >= 200 && r.statusCode() < 300) {
                text = new String(in.readNBytes(65_536), java.nio.charset.StandardCharsets.UTF_8); // тело ограничено
            }
        }
        return new BatchSender.Response(r.statusCode(), r.headers().firstValue("Retry-After").orElse(null), text);
    }
}
