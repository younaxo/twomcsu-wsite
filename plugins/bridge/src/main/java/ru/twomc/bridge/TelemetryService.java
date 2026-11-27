package ru.twomc.bridge;

import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.concurrent.ThreadLocalRandom;
import java.util.logging.Logger;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Связка Bukkit и {@link TelemetryCore}: события входа и выхода, периодический обход игроков в главном потоке
 * (не больше {@value #PER_TICK_LIMIT} игроков за проход, раз в секунду), остановка с последней отправкой.
 *
 * <p>Потоки. Всё чтение данных игроков (Player, ItemStack, статистика) выполняется ТОЛЬКО здесь, в главном
 * потоке сервера, и сразу превращается в неизменяемые копии. Сборка JSON, подпись и HTTP идут на отдельном
 * daemon-потоке {@code TwoMCBridge-Events}; главный поток HTTP не ждёт никогда (кроме одной ограниченной по времени
 * финальной отправки при остановке сервера).
 */
final class TelemetryService implements Listener {
    private static final int PER_TICK_LIMIT = 10;
    private static final long SHUTDOWN_FLUSH_MS = 5_000L;

    private final JavaPlugin plugin;
    private final TelemetryConfig cfg;
    private final TelemetryCore core;
    private final EventPipeline pipeline;
    private final Scheduler io;
    private final Logger log;
    private BukkitTask task;
    private long lastHousekeeping = 0;
    private boolean failureLogged = false;

    private TelemetryService(JavaPlugin plugin, TelemetryConfig cfg, TelemetryCore core, EventPipeline pipeline,
                             Scheduler io, Logger log) {
        this.plugin = plugin;
        this.cfg = cfg;
        this.core = core;
        this.pipeline = pipeline;
        this.io = io;
        this.log = log;
    }

    static TelemetryService start(JavaPlugin plugin, BridgeConfig conf, TelemetryConfig cfg, Path dataFolder) {
        Logger log = plugin.getLogger();
        long startMs = System.currentTimeMillis();
        Path epochFile = dataFolder.resolve("inventory-epoch.txt");
        long epoch = startMs;
        if (cfg.inventoryEnabled) {
            epoch = EpochStore.next(epochFile, startMs, log);
            if (epoch > startMs + 5 * 60_000L) {
                log.warning("Эпоха инвентаря (" + epoch + ") опережает часы хоста больше чем на 5 минут: проверьте время на сервере. "
                        + "Сайт отклоняет эпоху дальше чем на 10 минут вперёд.");
            }
        }
        Scheduler io = new Scheduler.Pool("TwoMCBridge-Events");
        BridgeApi api = new BridgeApi(conf.base, conf.keyId, conf.key(), new JdkTransport(Duration.ofSeconds(20)),
                System::currentTimeMillis);
        byte[] salt = new byte[3];
        new SecureRandom().nextBytes(salt);
        String streamId = "boot-" + Long.toString(startMs, 36) + "-" + HexFormat.of().formatHex(salt);
        TelemetryCore core = new TelemetryCore(cfg, io, System::currentTimeMillis, log, epoch, epochFile);
        EventPipeline pipeline = new EventPipeline(api, io, System::currentTimeMillis, () -> ThreadLocalRandom.current().nextDouble(),
                log, EventsProtocol.serverIdOf(conf.keyId), streamId, core);
        core.attach(new TelemetryCore.Sink() {
            @Override
            public void submit(EventPipeline.Pending p) {
                pipeline.submit(p);
            }

            @Override
            public boolean blocked(String type) {
                return pipeline.isBlocked(type);
            }
        });
        TelemetryService svc = new TelemetryService(plugin, cfg, core, pipeline, io, log);
        Bukkit.getPluginManager().registerEvents(svc, plugin);
        svc.task = Bukkit.getScheduler().runTaskTimer(plugin, svc::tick, 100L, 20L);
        // Игроки, уже бывшие на сервере (перезагрузка плагина): считаем вошедшими, первый снимок по расписанию.
        long now = System.currentTimeMillis();
        for (Player p : Bukkit.getOnlinePlayers()) {
            core.onJoin(p.getUniqueId().toString(), now, ThreadLocalRandom.current().nextDouble());
        }
        return svc;
    }

    TelemetryCore core() {
        return core;
    }

    EventPipeline pipeline() {
        return pipeline;
    }

    // ---- главный поток ----

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent e) {
        guard(() -> core.onJoin(e.getPlayer().getUniqueId().toString(), System.currentTimeMillis(),
                ThreadLocalRandom.current().nextDouble()));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent e) {
        guard(() -> {
            Player p = e.getPlayer();
            long now = System.currentTimeMillis();
            String id = p.getUniqueId().toString();
            snapshot(p, now, false, false);
            core.onQuit(id, now);
        });
    }

    private void tick() {
        guard(() -> {
            long now = System.currentTimeMillis();
            int budget = PER_TICK_LIMIT;
            boolean statsOn = cfg.statsEnabled && !pipeline.isBlocked(EventsProtocol.TYPE_STATS);
            boolean invOn = cfg.inventoryEnabled && !core.safeMode() && !pipeline.isBlocked(EventsProtocol.TYPE_INVENTORY);
            if (statsOn || invOn) {
                core.<Player>runTick(Bukkit.getOnlinePlayers(), p -> p.getUniqueId().toString(), now, statsOn, invOn, budget,
                        (p, id, s, i) -> {
                            if (s) core.requestStats(BukkitCollector.stats(p, cfg), now, false);
                            if (i) core.requestInventory(id, BukkitCollector.mainGroup(p), BukkitCollector.enderGroup(p), true, now, false);
                        });
            }
            if (now - lastHousekeeping >= 10_000L) {
                lastHousekeeping = now;
                core.housekeeping(now);
            }
        });
    }

    /** Снимок игрока по текущему состоянию. {@code online=false} при выходе и остановке. */
    private void snapshot(Player p, long now, boolean online, boolean force) {
        String id = p.getUniqueId().toString();
        if (cfg.statsEnabled) {
            core.requestStats(BukkitCollector.stats(p, cfg), now, force);
        }
        if (cfg.inventoryEnabled && !core.safeMode()) {
            core.requestInventory(id, BukkitCollector.mainGroup(p), BukkitCollector.enderGroup(p), online, now, force);
        }
    }

    /** Снимки не должны ломать вход, выход и тик сервера: ошибка логируется один раз. */
    private void guard(Runnable r) {
        try {
            r.run();
        } catch (RuntimeException | LinkageError e) {
            if (!failureLogged) {
                failureLogged = true;
                log.warning("Снимки: ошибка чтения данных игрока (" + e.getClass().getSimpleName()
                        + "), дальнейшие такие ошибки не логируются. Версия ядра несовместима?");
            }
        }
    }

    /** Остановка плагина (главный поток): последний снимок онлайн-игроков и одна ограниченная по времени отправка. */
    void shutdown() {
        if (task != null) task.cancel();
        org.bukkit.event.HandlerList.unregisterAll(this);
        long now = System.currentTimeMillis();
        guard(() -> {
            for (Player p : Bukkit.getOnlinePlayers()) {
                guard(() -> snapshot(p, now, false, true)); // ошибка одного игрока не мешает остальным
            }
        });
        core.drain(SHUTDOWN_FLUSH_MS); // сборки (в порядке постановки) и их события - в очередь до финальной отправки
        pipeline.flushOnce(SHUTDOWN_FLUSH_MS);
        pipeline.stop();
        io.shutdown();
    }
}
