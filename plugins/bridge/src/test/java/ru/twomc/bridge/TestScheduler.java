package ru.twomc.bridge;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/** Ручной планировщик с виртуальным временем: schedule(delay) срабатывает при advance(). Для тестов снимков. */
final class TestScheduler implements Scheduler {
    private record Task(long due, long order, Runnable r, boolean[] cancelled) {}

    final AtomicLong now = new AtomicLong(1_800_000_000_000L);
    private final List<Task> tasks = new ArrayList<>();
    private long counter = 0;
    boolean shutdown;

    @Override
    public void execute(Runnable r) {
        tasks.add(new Task(now.get(), counter++, r, new boolean[1]));
    }

    @Override
    public Cancellable schedule(long delayMs, Runnable r) {
        boolean[] c = new boolean[1];
        tasks.add(new Task(now.get() + Math.max(0, delayMs), counter++, r, c));
        return () -> c[0] = true;
    }

    @Override
    public void runAndAwait(Runnable r, long timeoutMs) {
        r.run();
    }

    @Override
    public void shutdown() {
        shutdown = true;
    }

    /** Выполнить всё, что уже должно сработать (в том числе добавленное по ходу), без перемотки времени. */
    void runDue() {
        while (true) {
            Task next = tasks.stream().filter(t -> t.due() <= now.get()).min(Comparator.comparingLong(Task::due).thenComparingLong(Task::order)).orElse(null);
            if (next == null) return;
            tasks.remove(next);
            if (!next.cancelled()[0]) next.r().run();
        }
    }

    /** Перемотать время на ms и выполнить сработавшее по порядку сроков. */
    void advance(long ms) {
        long target = now.get() + ms;
        while (true) {
            Task next = tasks.stream().filter(t -> t.due() <= target).min(Comparator.comparingLong(Task::due).thenComparingLong(Task::order)).orElse(null);
            if (next == null) break;
            tasks.remove(next);
            if (next.due() > now.get()) now.set(next.due());
            if (!next.cancelled()[0]) next.r().run();
        }
        now.set(target);
    }

    int pending() {
        return (int) tasks.stream().filter(t -> !t.cancelled()[0]).count();
    }
}
