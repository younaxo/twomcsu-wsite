package ru.twomc.bridge;

import java.io.IOException;
import java.net.URI;
import java.util.Map;

/** HTTP-транспорт. Вызывается ТОЛЬКО из асинхронного потока плагина, никогда из главного потока сервера. */
interface Transport {
    /** @param retryAfter значение заголовка Retry-After, @param date значение заголовка Date (для диагностики часов) */
    record Response(int status, String retryAfter, String date, String body) {}

    Response post(URI uri, Map<String, String> headers, byte[] body) throws IOException, InterruptedException;
}
