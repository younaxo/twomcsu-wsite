package ru.twomc.giveaway;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Локальная очередь событий. Состояние в памяти, зеркало в файле queue.log (одно событие на строку).
 * enqueue() не делает ввода-вывода (вызывается с главного потока): строки копятся в буфере, flush()
 * дописывает их в файл (вызывается асинхронно). Удаление (ack, dead-letter, истечение) переписывает файл
 * атомарно. После рестарта очередь восстанавливается из файла.
 * Порядок блокировок: fileLock, затем lock.
 */
public final class EventQueue {
    private final Path queueFile;
    private final Path deadLetterFile;
    private final Logger log;
    private final int maxEvents;

    private final Object lock = new Object();
    private final Object fileLock = new Object();
    private final LinkedHashMap<String, GiveawayEvent> events = new LinkedHashMap<>();
    private StringBuilder pending = new StringBuilder();

    private long droppedOverflow;
    private long droppedExpired;
    private long deadLettered;
    private long corruptLines;

    public EventQueue(Path dataFolder, int maxEvents, Logger log) {
        this.queueFile = dataFolder.resolve("queue.log");
        this.deadLetterFile = dataFolder.resolve("dead-letter.log");
        this.maxEvents = maxEvents;
        this.log = log;
    }

    /** Загружает очередь из файла. Повреждённые строки уходят в dead-letter. */
    public void load() {
        synchronized (fileLock) {
            if (!Files.exists(queueFile)) return;
            List<String> lines;
            try {
                lines = Files.readAllLines(queueFile, StandardCharsets.UTF_8);
            } catch (IOException | RuntimeException e) {
                log.log(Level.WARNING, "Не удалось прочитать очередь: {0}", e.getClass().getSimpleName());
                return;
            }
            List<String> corrupt = new ArrayList<>();
            synchronized (lock) {
                for (String line : lines) {
                    if (line.isEmpty()) continue;
                    GiveawayEvent ev = GiveawayEvent.fromLine(line);
                    if (ev == null) {
                        corrupt.add(line);
                    } else {
                        events.putIfAbsent(ev.eventId(), ev);
                    }
                }
                corruptLines += corrupt.size();
            }
            if (!corrupt.isEmpty()) {
                appendDeadLetter("corrupt_line", corrupt);
                rewriteLocked();
            }
        }
    }

    /** @return false, если событие отброшено из-за переполнения. */
    public boolean enqueue(GiveawayEvent ev) {
        synchronized (lock) {
            if (events.size() >= maxEvents) {
                droppedOverflow++;
                return false;
            }
            if (events.putIfAbsent(ev.eventId(), ev) == null) {
                pending.append(ev.toLine()).append('\n');
            }
            return true;
        }
    }

    /** Дописывает накопленные строки в файл. */
    public void flush() {
        synchronized (fileLock) {
            String chunk;
            synchronized (lock) {
                if (pending.length() == 0) return;
                chunk = pending.toString();
                pending = new StringBuilder();
            }
            try {
                Files.writeString(queueFile, chunk, StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            } catch (IOException e) {
                synchronized (lock) {
                    pending.insert(0, chunk);
                }
                log.log(Level.WARNING, "Не удалось записать очередь: {0}", e.getClass().getSimpleName());
            }
        }
    }

    /** Самые старые события, не более limit. */
    public List<GiveawayEvent> peek(int limit) {
        synchronized (lock) {
            List<GiveawayEvent> out = new ArrayList<>(Math.min(limit, events.size()));
            Iterator<GiveawayEvent> it = events.values().iterator();
            while (it.hasNext() && out.size() < limit) out.add(it.next());
            return out;
        }
    }

    /** Удаление после подтверждения (2xx). */
    public void ack(Collection<GiveawayEvent> batch) {
        removeAll(batch);
    }

    /** Пакет не принимается сервером (ошибка схемы): в отдельный файл, из очереди убрать. */
    public void deadLetter(Collection<GiveawayEvent> batch, String reason) {
        List<String> lines = new ArrayList<>(batch.size());
        for (GiveawayEvent e : batch) lines.add(e.toLine());
        synchronized (fileLock) {
            appendDeadLetter(reason, lines);
        }
        synchronized (lock) {
            deadLettered += batch.size();
        }
        removeAll(batch);
    }

    /** Отбрасывает события старше maxAgeMillis. @return сколько отброшено. */
    public int purgeOlderThan(long nowMillis, long maxAgeMillis) {
        List<GiveawayEvent> old = new ArrayList<>();
        synchronized (lock) {
            for (GiveawayEvent e : events.values()) {
                if (nowMillis - e.occurredAtMillis() > maxAgeMillis) old.add(e);
            }
            droppedExpired += old.size();
        }
        if (!old.isEmpty()) removeAll(old);
        return old.size();
    }

    public int size() {
        synchronized (lock) {
            return events.size();
        }
    }

    /** Время самого старого события или -1. */
    public long oldestMillis() {
        synchronized (lock) {
            long min = -1;
            for (GiveawayEvent e : events.values()) {
                if (min < 0 || e.occurredAtMillis() < min) min = e.occurredAtMillis();
            }
            return min;
        }
    }

    public long droppedOverflow() { synchronized (lock) { return droppedOverflow; } }
    public long droppedExpired() { synchronized (lock) { return droppedExpired; } }
    public long deadLettered() { synchronized (lock) { return deadLettered; } }
    public long corruptLines() { synchronized (lock) { return corruptLines; } }

    private void removeAll(Collection<GiveawayEvent> batch) {
        synchronized (fileLock) {
            synchronized (lock) {
                Set<String> ids = new HashSet<>();
                for (GiveawayEvent e : batch) ids.add(e.eventId());
                events.keySet().removeAll(ids);
            }
            rewriteLocked();
        }
    }

    /** Полная атомарная перезапись файла; вызывать под fileLock. */
    private void rewriteLocked() {
        StringBuilder sb = new StringBuilder();
        synchronized (lock) {
            for (GiveawayEvent e : events.values()) {
                sb.append(e.toLine()).append('\n');
            }
            pending = new StringBuilder(); // снимок уже включает всё, что было в буфере
        }
        Path tmp = queueFile.resolveSibling("queue.log.tmp");
        try {
            Files.writeString(tmp, sb.toString(), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, queueFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ex) {
                Files.move(tmp, queueFile, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            log.log(Level.WARNING, "Не удалось переписать очередь: {0}", e.getClass().getSimpleName());
        }
    }

    private void appendDeadLetter(String reason, List<String> lines) {
        StringBuilder sb = new StringBuilder();
        long now = System.currentTimeMillis();
        for (String l : lines) sb.append(now).append('\t').append(reason).append('\t').append(l).append('\n');
        try {
            Files.writeString(deadLetterFile, sb.toString(), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            log.log(Level.WARNING, "Не удалось записать dead-letter: {0}", e.getClass().getSimpleName());
        }
    }
}
