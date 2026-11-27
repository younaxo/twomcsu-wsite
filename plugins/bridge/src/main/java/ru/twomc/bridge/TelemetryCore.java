package ru.twomc.bridge;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.function.LongSupplier;
import java.util.logging.Logger;

/**
 * Логика снимков без обращений к Bukkit: ограничения частоты, пропуск неизменившегося инвентаря, нумерация
 * (epoch, rev), безопасный режим инвентаря. Вызывается из главного потока (request*, onJoin, onQuit, due*) и из
 * потока ввода-вывода (сборка JSON, результаты); все методы синхронизированы, держатся недолго.
 *
 * <p>Данные приходят уже скопированными из Bukkit ({@link StatsData}, {@link InventoryData}); здесь нет ссылок на
 * сервер. Сборка JSON инвентаря и отправка идут на потоке ввода-вывода.
 */
final class TelemetryCore implements EventPipeline.Listener {
    interface Sink {
        void submit(EventPipeline.Pending p);

        boolean blocked(String type);
    }

    /** Данные для разбора ответа по инвентарю. */
    record Meta(String key, String hash) {}

    private static final class PlayerState {
        long lastStatsSubmit = Long.MIN_VALUE / 2;
        long nextStatsDue;
        long lastInvSubmit = Long.MIN_VALUE / 2;
        long nextInvDue;
        boolean online;
        long lastSeen;
    }

    private record Accepted(String hash, long at) {}

    record Status(boolean statsEnabled, boolean inventoryEnabled, boolean safeMode, String safeReason, long epoch, long rev, int players) {}

    static final long STATS_MIN_GAP_MS = 30_000L;
    static final long JOIN_INVENTORY_DELAY_MS = 60_000L;
    static final int STALE_LIMIT = 3;
    static final int INVALID_LIMIT = 5;
    static final long REMIND_MS = 60 * 60_000L;
    static final long MAX_REV = 2_147_483_647L;

    private final TelemetryConfig cfg;
    private final Scheduler io;
    private final LongSupplier clock;
    private final Logger log;
    private final Path epochFile; // null в тестах
    private Sink sink;

    private final Map<String, PlayerState> players = new HashMap<>();
    private final Map<String, Accepted> accepted = new HashMap<>();
    private final Map<String, Integer> staleStreak = new HashMap<>();
    private final Map<String, Long> warnedAt = new HashMap<>();
    private long epoch;
    private long rev = 0;
    private int invalidStreak = 0;
    private boolean safeMode = false;
    private String safeReason = "";
    private long lastRemind = 0;

    TelemetryCore(TelemetryConfig cfg, Scheduler io, LongSupplier clock, Logger log, long epoch, Path epochFile) {
        this.cfg = cfg;
        this.io = io;
        this.clock = clock;
        this.log = log;
        this.epoch = epoch;
        this.epochFile = epochFile;
    }

    void attach(Sink sink) {
        this.sink = sink;
    }

    // ---- главный поток ----

    synchronized void onJoin(String uuid, long now, double jitter01) {
        PlayerState st = players.computeIfAbsent(uuid, k -> new PlayerState());
        st.online = true;
        st.lastSeen = now;
        st.nextStatsDue = now + cfg.statsIntervalMs;
        st.nextInvDue = now + JOIN_INVENTORY_DELAY_MS + (long) (jitter01 * 30_000L);
    }

    synchronized void onQuit(String uuid, long now) {
        PlayerState st = players.get(uuid);
        if (st != null) {
            st.online = false;
            st.lastSeen = now;
        }
    }

    synchronized boolean statsDue(String uuid, long now) {
        PlayerState st = players.get(uuid);
        return cfg.statsEnabled && st != null && st.online && now >= st.nextStatsDue;
    }

    synchronized boolean inventoryDue(String uuid, long now) {
        PlayerState st = players.get(uuid);
        return cfg.inventoryEnabled && !safeMode && st != null && st.online && now >= st.nextInvDue;
    }

    /** @param force только при остановке сервера: обходит ограничение частоты (один снимок на игрока) */
    boolean requestStats(StatsData d, long now, boolean force) {
        String json;
        synchronized (this) {
            if (!cfg.statsEnabled || sink == null || sink.blocked(EventsProtocol.TYPE_STATS)) return false;
            json = d.toDataJson();
            if (json == null) return false;
            PlayerState st = players.computeIfAbsent(d.uuid(), k -> new PlayerState());
            if (!force && now - st.lastStatsSubmit < STATS_MIN_GAP_MS) {
                st.nextStatsDue = st.lastStatsSubmit + STATS_MIN_GAP_MS;
                return false;
            }
            st.lastStatsSubmit = now;
            st.nextStatsDue = now + cfg.statsIntervalMs;
            st.lastSeen = now;
        }
        sink.submit(new EventPipeline.Pending(EventsProtocol.TYPE_STATS, "stats:" + d.uuid(), now, json, null));
        return true;
    }

    /** Не чаще раза в inventoryMinGap (не меньше 30 с) на игрока; JSON собирается уже вне главного потока. */
    boolean requestInventory(String uuid, InventoryData main, InventoryData ender, boolean online, long now, boolean force) {
        synchronized (this) {
            if (!cfg.inventoryEnabled || safeMode || sink == null || sink.blocked(EventsProtocol.TYPE_INVENTORY)) return false;
            PlayerState st = players.computeIfAbsent(uuid, k -> new PlayerState());
            if (!force && now - st.lastInvSubmit < cfg.inventoryMinGapMs) {
                st.nextInvDue = st.lastInvSubmit + cfg.inventoryMinGapMs;
                return false;
            }
            st.lastInvSubmit = now;
            st.nextInvDue = now + cfg.inventoryIntervalMs;
            st.lastSeen = now;
        }
        InventoryData[] groups = {main, ender};
        if (force) {
            buildInventory(uuid, groups, online, now); // остановка сервера: сразу, поток ввода-вывода будет сброшен следом
        } else {
            io.execute(() -> buildInventory(uuid, groups, online, now));
        }
        return true;
    }

    // ---- поток ввода-вывода ----

    private synchronized void buildInventory(String uuid, InventoryData[] groups, boolean online, long now) {
        if (safeMode) return;
        for (InventoryData g : groups) {
            if (g == null) continue;
            String slots = g.slotsJson();
            String hash = Signer.sha256Hex(((online ? "1" : "0") + slots).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            String key = "inventory:" + uuid + ":" + g.group;
            Accepted prev = accepted.get(key);
            if (prev != null && prev.hash().equals(hash) && now - prev.at() < cfg.inventoryHeartbeatMs) {
                continue; // состав не менялся, сайт уже имеет его: не шлём
            }
            if (rev >= MAX_REV) {
                enterSafeMode("счётчик rev достиг предела " + MAX_REV + "; перезапустите плагин");
                return;
            }
            rev++;
            String json = InventoryData.dataJson(uuid, g.group, epoch, rev, now, online, slots);
            int bytes = InventoryData.utf8Bytes(json);
            if (bytes > EventsProtocol.MAX_EVENT_DATA_BYTES) {
                warnLimited("size:" + key, now, "снимок инвентаря игрока " + shortId(uuid) + " (" + g.group + ") не отправлен: размер "
                        + bytes + " байт больше лимита " + EventsProtocol.MAX_EVENT_DATA_BYTES + " (отправка частями появится позже).");
                continue;
            }
            sink.submit(new EventPipeline.Pending(EventsProtocol.TYPE_INVENTORY, key, now, json, new Meta(key, hash)));
        }
    }

    @Override
    public synchronized void onResult(EventPipeline.Pending p, String status, String code) {
        if (!EventsProtocol.TYPE_INVENTORY.equals(p.type) || !(p.meta instanceof Meta m)) {
            return;
        }
        long now = clock.getAsLong();
        switch (status) {
            case "accepted", "duplicate" -> {
                accepted.put(m.key(), new Accepted(m.hash(), now));
                staleStreak.remove(m.key());
                invalidStreak = 0;
            }
            case "stale" -> {
                int n = staleStreak.merge(m.key(), 1, Integer::sum);
                if (n >= STALE_LIMIT) {
                    enterSafeMode("сайт трижды подряд ответил stale для одной группы: ряд отравлен эпохой из будущего "
                            + "или часы хоста откатились");
                }
            }
            default -> {
                if ("epoch_out_of_range".equals(code)) {
                    enterSafeMode("сайт отклонил epoch (epoch_out_of_range): проверьте часы хоста");
                } else if ("invalid_data".equals(code) && ++invalidStreak >= INVALID_LIMIT) {
                    // Сайт отдаёт epoch_out_of_range как invalid_data (16.4), отличить нельзя: серия отказов = безопасный режим.
                    enterSafeMode(INVALID_LIMIT + " отказов invalid_data подряд (возможна неверная epoch из-за часов хоста)");
                }
            }
        }
    }

    // ---- служебное ----

    /** Раз в несколько секунд из главного потока: напоминание о безопасном режиме, чистка таблиц. */
    synchronized void housekeeping(long now) {
        if (safeMode && now - lastRemind >= REMIND_MS) {
            lastRemind = now;
            log.warning("Инвентарь: БЕЗОПАСНЫЙ РЕЖИМ, снимки не отправляются. Причина: " + safeReason
                    + ". После исправления выполните /twomcbridge invresume.");
        }
        players.values().removeIf(s -> !s.online && now - s.lastSeen > 60 * 60_000L);
        Iterator<Map.Entry<String, Accepted>> it = accepted.entrySet().iterator();
        while (it.hasNext()) {
            if (now - it.next().getValue().at() > 2 * cfg.inventoryHeartbeatMs) it.remove();
        }
        warnedAt.values().removeIf(t -> now - t > 10 * 60_000L);
    }

    /** Подтверждение оператора после исправления часов (контракт 6.1, правило плагина, г): новая эпоха = сейчас. */
    synchronized String resumeInventory(long now) {
        if (!safeMode) return "Безопасный режим инвентаря не включён.";
        long saved = epoch;
        epoch = Math.max(now, 1);
        rev = 0;
        invalidStreak = 0;
        staleStreak.clear();
        accepted.clear();
        safeMode = false;
        safeReason = "";
        if (epochFile != null) EpochStore.write(epochFile, epoch, log);
        log.warning("Оператор возобновил снимки инвентаря: новая epoch " + epoch + " (была " + saved + "); отправится один пробный снимок.");
        return "Снимки инвентаря возобновлены, новая epoch " + epoch + ". При повторном отказе режим включится снова.";
    }

    synchronized Status status() {
        return new Status(cfg.statsEnabled, cfg.inventoryEnabled, safeMode, safeReason, epoch, rev, players.size());
    }

    synchronized boolean safeMode() {
        return safeMode;
    }

    private void enterSafeMode(String reason) {
        if (safeMode) return;
        safeMode = true;
        safeReason = reason;
        lastRemind = clock.getAsLong();
        log.severe("Инвентарь: БЕЗОПАСНЫЙ РЕЖИМ. " + reason + ". Снимки инвентаря не отправляются, статистика и выдача работают."
                + " После исправления выполните /twomcbridge invresume.");
    }

    private void warnLimited(String key, long now, String message) {
        Long prev = warnedAt.get(key);
        if (prev != null && now - prev < 10 * 60_000L) return;
        warnedAt.put(key, now);
        log.warning("Инвентарь: " + message);
    }

    static String shortId(String uuid) {
        return uuid.length() >= 8 ? uuid.substring(0, 8) : uuid;
    }
}
