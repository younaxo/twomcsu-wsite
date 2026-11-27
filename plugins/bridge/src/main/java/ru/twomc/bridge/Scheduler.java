package ru.twomc.bridge;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Один поток ввода-вывода плагина (не главный поток сервера): сетевые запросы и циклы опроса. */
interface Scheduler {
    interface Cancellable {
        void cancel();
    }

    /** Выполнить как можно скорее на потоке ввода-вывода. */
    void execute(Runnable r);

    Cancellable schedule(long delayMs, Runnable r);

    /** Выполнить на потоке ввода-вывода и ждать не дольше timeoutMs (для финальной отправки при остановке). */
    void runAndAwait(Runnable r, long timeoutMs);

    void shutdown();

    /** Реализация на одном daemon-потоке. */
    final class Pool implements Scheduler {
        private final ScheduledExecutorService ex;

        Pool(String threadName) {
            ScheduledThreadPoolExecutor e = new ScheduledThreadPoolExecutor(1, run -> {
                Thread t = new Thread(run, threadName);
                t.setDaemon(true);
                return t;
            });
            e.setRemoveOnCancelPolicy(true);
            this.ex = e;
        }

        @Override
        public void execute(Runnable r) {
            try {
                ex.execute(r);
            } catch (java.util.concurrent.RejectedExecutionException ignored) {
                // после остановки: не принимаем работу
            }
        }

        @Override
        public Cancellable schedule(long delayMs, Runnable r) {
            try {
                ScheduledFuture<?> f = ex.schedule(r, Math.max(0, delayMs), TimeUnit.MILLISECONDS);
                return () -> f.cancel(false);
            } catch (java.util.concurrent.RejectedExecutionException e) {
                return () -> { };
            }
        }

        @Override
        public void runAndAwait(Runnable r, long timeoutMs) {
            try {
                Future<?> f = ex.submit(r);
                f.get(timeoutMs, TimeUnit.MILLISECONDS);
            } catch (TimeoutException | ExecutionException | java.util.concurrent.RejectedExecutionException ignored) {
                // best-effort
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        @Override
        public void shutdown() {
            ex.shutdownNow();
        }
    }
}
