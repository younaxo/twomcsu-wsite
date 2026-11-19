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
 * дописывает их в файл (вызывается асинхронно). Удаление (ack, dead-letter, истечение) дописывает id в queue.ack (надгробия),
 * файл queue.log компактируется пакетно (атомарно), а не на каждый ack. После рестарта очередь восстанавливается из файла.
 * Порядок блокировок: fileLock, затем lock.
 */
public final class EventQueue {
    private final Path queueFile;
    private final Path deadLetterFile;
    private final Logger log;
    private final Path ackFile;
    private final int maxEvents;
    private final int compactMin;
    private final long deadLetterMaxBytes;
    private final java.util.function.LongSupplier clock;

    private final Object lock = new Object();
    private final Object fileLock = new Object();
    private final LinkedHashMap<String, GiveawayEvent> events = new LinkedHashMap<>();
    private StringBuilder pending = new StringBuilder();

    private long droppedOverflow;
    private long droppedExpired;
    private long deadLettered;
    private long corruptLines;
    private int removedSinceCompact;
    private long lastOverflowWarnAt = -1;
    private long overflowSinceWarn;
    static final long OVERFLOW_WARN_MS = 5 * 60_000L;
    static final int COMPACT_MIN = 1000;
    static final long DEAD_LETTER_MAX_BYTES = 10L * 1024 * 1024;

    public EventQueue(Path dataFolder, int maxEvents, Logger log) {
        this(dataFolder, maxEvents, log, COMPACT_MIN, DEAD_LETTER_MAX_BYTES, System::currentTimeMillis);
    }

    EventQueue(Path dataFolder, int maxEvents, Logger log, int compactMin, long deadLetterMaxBytes,
               java.util.function.LongSupplier clock) {
        this.queueFile = dataFolder.resolve("queue.log");
        this.ackFile = dataFolder.resolve("queue.ack");
        this.deadLetterFile = dataFolder.resolve("dead-letter.log");
        this.maxEvents = maxEvents;
        this.log = log;
        this.compactMin = compactMin;
        this.deadLetterMaxBytes = deadLetterMaxBytes;
        this.clock = clock;
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
            Set<String> acked = new HashSet<>();
            try {
                if (Files.exists(ackFile)) {
                    for (String l : Files.readAllLines(ackFile, StandardCharsets.UTF_8)) {
                        if (!l.isEmpty()) acked.add(l);
                    }
                }
            } catch (IOException | RuntimeException e) {
                log.log(Level.WARNING, "Не удалось прочитать queue.ack: {0}", e.getClass().getSimpleName());
            }
            List<String> corrupt = new ArrayList<>();
            synchronized (lock) {
                for (String line : lines) {
                    if (line.isEmpty()) continue;
                    GiveawayEvent ev = GiveawayEvent.fromLine(line);
                    if (ev == null) {
                        corrupt.add(line);
                    } else if (!acked.contains(ev.eventId())) {
                        events.putIfAbsent(ev.eventId(), ev);
                    }
                }
                corruptLines += corrupt.size();
                removedSinceCompact = acked.size();
            }
            if (!corrupt.isEmpty()) {
                appendDeadLetter("corrupt_line", corrupt);
            }
            if (!corrupt.isEmpty() || !acked.isEmpty()) {
                compactLocked();
            }
        }
    }

    /** @return false, если событие отброшено из-за переполнения. */
    public boolean enqueue(GiveawayEvent ev) {
        String warn = null;
        synchronized (lock) {
            if (events.size() >= maxEvents) {
                droppedOverflow++;
                overflowSinceWarn++;
                long now = clock.getAsLong();
                if (lastOverflowWarnAt < 0 || now - lastOverflowWarnAt >= OVERFLOW_WARN_MS) {
                    lastOverflowWarnAt = now;
                    warn = "ОЧЕРЕДЬ ПЕРЕПОЛНЕНА (" + maxEvents + " событий): новые события теряются, отброшено с прошлого"
                            + " предупреждения: " + overflowSinceWarn + ", всего " + droppedOverflow
                            + ". Проверьте связь с сайтом и /giveawaytime.";
                    overflowSinceWarn = 0;
                }
            } else {
                if (events.putIfAbsent(ev.eventId(), ev) == null) {
                    pending.append(ev.toLine()).append('\n');
                }
                return true;
            }
        }
        if (warn != null) log.severe(warn); // вне lock; редко (раз в 5 минут)
        return false;
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
            StringBuilder tomb = new StringBuilder();
            boolean compact;
            synchronized (lock) {
                for (GiveawayEvent e : batch) {
                    if (events.remove(e.eventId()) != null) {
                        tomb.append(e.eventId()).append('\n');
                        removedSinceCompact++;
                    }
                }
                compact = events.isEmpty() ? removedSinceCompact > 0
                        : removedSinceCompact >= compactMin && removedSinceCompact >= events.size();
            }
            if (compact) {
                compactLocked(); // надгробия не нужны: снимок уже без удалённых
            } else if (tomb.length() > 0) {
                try { // дешёвая дозапись вместо переписывания всей очереди
                    Files.writeString(ackFile, tomb.toString(), StandardCharsets.UTF_8,
                            StandardOpenOption.CREATE, StandardOpenOption.APPEND);
                } catch (IOException e) {
                    log.log(Level.WARNING, "Не удалось записать queue.ack: {0}", e.getClass().getSimpleName());
                }
            }
        }
    }

    /**
     * Пакетная компакция: атомарная перезапись queue.log по снимку и очистка queue.ack; под fileLock.
     * Под lock (его берёт главный поток) только копия значений и сброс буфера, без ввода-вывода и без форматирования.
     */
    private void compactLocked() {
        List<GiveawayEvent> snapshot;
        synchronized (lock) {
            snapshot = new ArrayList<>(events.values());
            pending = new StringBuilder(); // снимок уже включает всё, что было в буфере
            removedSinceCompact = 0;
        }
        StringBuilder sb = new StringBuilder();
        for (GiveawayEvent e : snapshot) sb.append(e.toLine()).append('\n');
        Path tmp = queueFile.resolveSibling("queue.log.tmp");
        try {
            Files.writeString(tmp, sb.toString(), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, queueFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ex) {
                Files.move(tmp, queueFile, StandardCopyOption.REPLACE_EXISTING);
            }
            Files.deleteIfExists(ackFile); // сбой между move и delete безопасен: лишние id просто не найдутся
        } catch (IOException e) {
            log.log(Level.WARNING, "Не удалось переписать очередь: {0}", e.getClass().getSimpleName());
        }
    }

    private void appendDeadLetter(String reason, List<String> lines) {
        StringBuilder sb = new StringBuilder();
        long now = System.currentTimeMillis();
        for (String l : lines) sb.append(now).append('\t').append(reason).append('\t').append(l).append('\n');
        try {
            if (Files.exists(deadLetterFile)
                    && Files.size(deadLetterFile) + sb.length() > deadLetterMaxBytes / 2) {
                Path old = deadLetterFile.resolveSibling("dead-letter.log.1"); // суммарно не больше deadLetterMaxBytes
                Files.move(deadLetterFile, old, StandardCopyOption.REPLACE_EXISTING);
                log.warning("dead-letter.log достиг лимита, предыдущий переименован в dead-letter.log.1 (старый .1 удалён).");
            }
            Files.writeString(deadLetterFile, sb.toString(), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            log.log(Level.WARNING, "Не удалось записать dead-letter: {0}", e.getClass().getSimpleName());
        }
    }
}
