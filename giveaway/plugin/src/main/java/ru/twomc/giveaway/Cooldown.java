package ru.twomc.giveaway;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Локальный кулдаун команды на игрока (защита от перебора и спама, сервер дополнительно лимитирует). */
public final class Cooldown {
    private final long periodMs;
    private final ConcurrentHashMap<UUID, Long> last = new ConcurrentHashMap<>();

    public Cooldown(long periodMs) { this.periodMs = periodMs; }

    /** @return true и фиксирует время, если с прошлой попытки прошло достаточно. */
    public boolean tryAcquire(UUID id, long nowMs) {
        boolean[] ok = {false};
        last.compute(id, (k, prev) -> {
            if (prev == null || nowMs - prev >= periodMs) {
                ok[0] = true;
                return nowMs;
            }
            return prev;
        });
        return ok[0];
    }

    /** Сколько секунд (с округлением вверх) осталось ждать; 0, если можно. */
    public long remainingSeconds(UUID id, long nowMs) {
        Long prev = last.get(id);
        if (prev == null) return 0;
        long rest = periodMs - (nowMs - prev);
        return rest <= 0 ? 0 : (rest + 999) / 1000;
    }

    public void forget(UUID id) { last.remove(id); }
}
