package ru.twomc.bridge;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.logging.Logger;

/**
 * Эпоха инвентаря (контракт 6.1, формат эпохи): целое, строго растущее между перезапусками; берётся максимум из
 * «сохранённая + 1» и «время старта в мс». Если файла нет или он нечитаем, эпоха равна времени старта.
 * Файл не секретный (одно число).
 */
final class EpochStore {
    private EpochStore() {}

    static long next(Path file, long nowMs, Logger log) {
        long saved = 0;
        try {
            if (Files.exists(file)) {
                saved = Long.parseLong(Files.readString(file, StandardCharsets.UTF_8).trim());
            }
        } catch (IOException | RuntimeException e) {
            log.warning("Эпоха инвентаря: файл не прочитан (" + e.getClass().getSimpleName() + "), эпоха = время старта.");
            saved = 0;
        }
        long epoch = Math.max(saved + 1, nowMs);
        write(file, epoch, log);
        return epoch;
    }

    static void write(Path file, long epoch, Logger log) {
        try {
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, Long.toString(epoch), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException | RuntimeException e) {
            log.warning("Эпоха инвентаря не сохранена (" + e.getClass().getSimpleName() + "): после перезапуска возьмётся время старта.");
        }
    }
}
