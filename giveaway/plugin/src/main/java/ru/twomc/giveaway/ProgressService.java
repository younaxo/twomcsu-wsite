package ru.twomc.giveaway;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Кэш прогресса игроков и состояние опроса POST /progress. poll() вызывается из асинхронного потока,
 * чтение кэша (плейсхолдеры, команды) допустимо с любого потока. Сетевые ошибки дают экспоненциальную паузу
 * (1, 2, 4, 5 минут максимум) в единицах «циклов опроса».
 */
public final class ProgressService {
    private final GiveawayApi api;
    private final QualifyNotifier notifier;
    private final ConcurrentHashMap<UUID, PlayerProgress> cache = new ConcurrentHashMap<>();

    private volatile long thresholdMinutes;
    private volatile long lastSuccessAt = -1;
    private volatile long lastAttemptAt = -1;
    private volatile String lastError = "";
    private volatile int consecutiveFailures;
    private volatile int skipCycles;
    private volatile int lastBatchSize;
    private volatile long pollsOk;
    private volatile long pollsFailed;

    public ProgressService(GiveawayApi api, QualifyNotifier notifier, long defaultThresholdMinutes) {
        this.api = api;
        this.notifier = notifier;
        this.thresholdMinutes = defaultThresholdMinutes;
    }

    /** Пропуск цикла из-за паузы после ошибок (вызывается на каждом тике опроса). */
    public boolean shouldSkipCycle() {
        if (skipCycles > 0) {
            skipCycles--;
            return true;
        }
        return false;
    }

    /**
     * Опрос пакетами до 100. Возвращает прогресс тех, кому надо показать уведомление о пороге.
     * Результат отметки (notified) уже записан.
     */
    public List<PlayerProgress> poll(List<UUID> online, long nowMs) {
        List<PlayerProgress> toNotify = new ArrayList<>();
        lastAttemptAt = nowMs;
        lastBatchSize = online.size();
        boolean allOk = true;
        String err = "";
        for (int from = 0; from < online.size(); from += Protocol.MAX_PROGRESS_UUIDS) {
            List<UUID> chunk = online.subList(from, Math.min(online.size(), from + Protocol.MAX_PROGRESS_UUIDS));
            GiveawayApi.ProgressOutcome out = api.progress(chunk);
            if (!out.ok()) {
                allOk = false;
                err = out.error();
                break;
            }
            for (Map.Entry<UUID, PlayerProgress> e : out.players().entrySet()) {
                PlayerProgress p = e.getValue();
                cache.put(e.getKey(), p);
                thresholdMinutes = p.thresholdMinutes();
                if (notifier.shouldNotify(p)) toNotify.add(p);
            }
        }
        if (allOk) {
            consecutiveFailures = 0;
            skipCycles = 0;
            lastError = "";
            lastSuccessAt = nowMs;
            pollsOk++;
        } else {
            lastError = err;
            pollsFailed++;
            int n = ++consecutiveFailures;
            skipCycles = Math.min(5, 1 << Math.min(n - 1, 3)) - 1;
        }
        return toNotify;
    }

    public PlayerProgress get(UUID id) { return cache.get(id); }

    public void forget(UUID id) { cache.remove(id); }

    /** После выдачи билета командой: кэш обновляется без ожидания следующего опроса. */
    public void markTicket(UUID id, String ticket) {
        cache.compute(id, (k, p) -> p == null ? null
                : new PlayerProgress(p.uuid(), p.minutes(), p.thresholdMinutes(), p.remainingMinutes(), p.percent(), p.qualified(), ticket));
    }

    public long thresholdMinutes() { return thresholdMinutes; }
    public long lastSuccessAt() { return lastSuccessAt; }
    public long lastAttemptAt() { return lastAttemptAt; }
    public String lastError() { return lastError; }
    public int consecutiveFailures() { return consecutiveFailures; }
    public int lastBatchSize() { return lastBatchSize; }
    public long pollsOk() { return pollsOk; }
    public long pollsFailed() { return pollsFailed; }
    public int cached() { return cache.size(); }
}
