package ru.twomc.bridge;

import java.io.IOException;

/**
 * Журнал ключей уже открыт другим экземпляром плагина (второй сервер или второй запуск на той же папке).
 * Отдельный тип, чтобы вызывающий код не разбирал текст сообщения исключения.
 */
final class JournalBusyException extends IOException {
    private static final long serialVersionUID = 1L;

    JournalBusyException() {
        super("журнал ключей уже занят другим экземпляром плагина");
    }
}
