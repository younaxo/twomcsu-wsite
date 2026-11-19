package ru.twomc.giveaway;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Решает, нужно ли показать игроку уведомление «порог набран». Один раз на игрока: отметка хранится в
 * data folder (notified.txt, один UUID на строку) и переживает рестарт. Уведомление не показывается,
 * если у игрока уже есть билет. Первое наблюдение qualified=true без отметки тоже даёт уведомление
 * (игрок мог набрать порог, пока был офлайн) и сразу ставит отметку. Вызывается из асинхронного потока.
 */
public final class QualifyNotifier {
    private final Set<UUID> notified = new HashSet<>();
    private final Path file; // null: без персистентности (тесты)

    public QualifyNotifier(Path file) {
        this.file = file;
        if (file != null && Files.isRegularFile(file)) {
            try {
                List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
                for (String l : lines) {
                    try {
                        notified.add(UUID.fromString(l.trim()));
                    } catch (IllegalArgumentException ignored) {
                        // повреждённая строка пропускается
                    }
                }
            } catch (IOException ignored) {
                // нет файла отметок: хуже всего, одно повторное уведомление
            }
        }
    }

    /** @return true, если уведомление нужно показать сейчас (отметка уже поставлена и записана). */
    public synchronized boolean shouldNotify(PlayerProgress p) {
        if (!p.qualified() || p.ticket() != null) return false;
        if (!notified.add(p.uuid())) return false;
        persist(p.uuid());
        return true;
    }

    private void persist(UUID id) {
        if (file == null) return;
        try {
            Files.writeString(file, id + "\n", StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException ignored) {
            // при сбое записи отметка живёт до рестарта
        }
    }

    public synchronized int size() { return notified.size(); }
}
