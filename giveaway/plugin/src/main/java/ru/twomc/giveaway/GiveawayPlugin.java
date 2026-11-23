package ru.twomc.giveaway;

import java.io.IOException;
import java.nio.file.Files;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.bukkit.Bukkit;
import org.bukkit.Sound;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Плагин учёта времени онлайн для розыгрыша. Универсальный Spigot 1.21.4..1.21.11:
 * только стабильный Bukkit/Spigot API, без NMS и Paper-API.
 * Главный поток: события и heartbeat (без ввода-вывода). Асинхронно: запись очереди и отправка.
 */
public final class GiveawayPlugin extends JavaPlugin implements Listener {
    private static final long HEARTBEAT_CHECK_TICKS = 20L * 5L; // проверка корзины минуты по реальным часам
    private final MinuteBucket minuteBucket = new MinuteBucket();
    private static final long SEND_TICKS = 20L * 5L;

    private AfkTracker afk;
    private EventQueue queue;
    private BatchSender sender;
    private BukkitTask heartbeatTask;
    private BukkitTask sendTask;
    private final java.util.concurrent.atomic.AtomicBoolean sending = new java.util.concurrent.atomic.AtomicBoolean();
    private final Set<UUID> invalidNameWarned = new HashSet<>();
    private volatile long skippedInvalidName;
    private String configProblem = "";
    private boolean onlineMode;

    // фаза 2
    private GiveawayApi api;
    private ProgressService progress;
    private Cooldown cooldown;
    private BukkitTask progressTask;
    private final java.util.concurrent.atomic.AtomicBoolean polling = new java.util.concurrent.atomic.AtomicBoolean();
    private boolean notifyEnabled = true;
    private boolean progressEnabled = true;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        FileConfiguration cfg = getConfig();

        int afkMinutes = Math.max(1, Math.min(60, cfg.getInt("afkMinutes", 5)));
        int maxQueue = Math.max(1000, cfg.getInt("maxQueueEvents", 100_000));
        afk = new AfkTracker(afkMinutes * 60_000L);

        try {
            Files.createDirectories(getDataFolder().toPath());
        } catch (IOException e) {
            getLogger().warning("Не удалось создать папку данных: " + e.getClass().getSimpleName());
        }
        queue = new EventQueue(getDataFolder().toPath(), maxQueue, getLogger());
        queue.load();

        SenderConfig.Result res = SenderConfig.resolve(
                cfg.getString("apiUrl", ""), cfg.getString("serverId", ""), cfg.getInt("keyVersion", 1),
                cfg.getString("keyFile", ""), System.getenv(), getDataFolder().toPath());
        if (res.ok()) {
            sender = new BatchSender(queue, res.config(), new JdkTransport(), System::currentTimeMillis,
                    getLogger(), () -> ThreadLocalRandom.current().nextDouble());
            getLogger().info("Отправка включена: сервер " + res.config().keyId + ", сайт " + res.config().endpoint.getHost());
        } else {
            configProblem = res.problem();
            sender = new BatchSender(queue, null, new JdkTransport(), System::currentTimeMillis, getLogger(),
                    () -> 0.5);
            getLogger().warning("Отправка ВЫКЛЮЧЕНА: " + configProblem
                    + ". События копятся в локальной очереди (до 72 ч) и будут отправлены после настройки и перезапуска.");
        }

        onlineMode = Bukkit.getOnlineMode();
        if (!onlineMode) {
            getLogger().severe("==========================================================================");
            getLogger().severe("ВНИМАНИЕ: online-mode=false. UUID игроков выводятся из ника, чужой ник можно");
            getLogger().severe("занять и накрутить время. Допустимо только за прокси (NullCord/Velocity) с");
            getLogger().severe("online-mode=true и защищённым пробросом IP/UUID, иначе розыгрыш небезопасен.");
            getLogger().severe("==========================================================================");
        }

        getServer().getPluginManager().registerEvents(this, this);

        long now = System.currentTimeMillis();
        for (Player p : Bukkit.getOnlinePlayers()) {
            afk.touch(p.getUniqueId(), now); // после /reload: игроки считаются только что активными
        }

        minuteBucket.advance(System.currentTimeMillis()); // первый heartbeat - со следующей минуты
        heartbeatTask = getServer().getScheduler().runTaskTimer(this, this::heartbeatTick, HEARTBEAT_CHECK_TICKS, HEARTBEAT_CHECK_TICKS);
        sendTask = getServer().getScheduler().runTaskTimerAsynchronously(this, this::sendTick, SEND_TICKS, SEND_TICKS);
        initPhase2(cfg, res);
    }

    @Override
    public void onDisable() {
        if (heartbeatTask != null) heartbeatTask.cancel();
        if (sendTask != null) sendTask.cancel();
        if (progressTask != null) progressTask.cancel();
        if (queue != null) queue.flush();
    }

    // ---- главный поток ----

    private void heartbeatTick() {
        if (minuteBucket.advance(System.currentTimeMillis())) heartbeatAll();
    }

    private void heartbeatAll() {
        long now = System.currentTimeMillis();
        for (Player p : Bukkit.getOnlinePlayers()) {
            UUID id = p.getUniqueId();
            enqueue(GiveawayEvent.isValidName(p.getName())
                    ? GiveawayEvent.heartbeat(id, p.getName(), now, afk.isActive(id, now)) : null, id, p.getName());
        }
    }

    private void enqueue(GiveawayEvent ev, UUID id, String name) {
        if (ev == null) {
            skippedInvalidName++;
            if (invalidNameWarned.add(id) && invalidNameWarned.size() <= 50) {
                getLogger().warning("Ник игрока не подходит под контракт (A-Za-z0-9_, 1-16), его события пропускаются.");
            }
            return;
        }
        queue.enqueue(ev);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent e) {
        Player p = e.getPlayer();
        long now = System.currentTimeMillis();
        afk.touch(p.getUniqueId(), now);
        enqueue(GiveawayEvent.isValidName(p.getName()) ? GiveawayEvent.join(p.getUniqueId(), p.getName(), now) : null,
                p.getUniqueId(), p.getName());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent e) {
        Player p = e.getPlayer();
        long now = System.currentTimeMillis();
        afk.remove(p.getUniqueId());
        if (progress != null) progress.forget(p.getUniqueId());
        if (cooldown != null) cooldown.forget(p.getUniqueId());
        enqueue(GiveawayEvent.isValidName(p.getName()) ? GiveawayEvent.quit(p.getUniqueId(), p.getName(), now) : null,
                p.getUniqueId(), p.getName());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent e) {
        if (e.getTo() == null) return;
        var f = e.getFrom();
        var t = e.getTo();
        if (AfkTracker.isMeaningfulMove(f.getBlockX(), f.getBlockY(), f.getBlockZ(), f.getYaw(), f.getPitch(),
                t.getBlockX(), t.getBlockY(), t.getBlockZ(), t.getYaw(), t.getPitch())) {
            afk.touch(e.getPlayer().getUniqueId(), System.currentTimeMillis());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onChat(AsyncPlayerChatEvent e) { // асинхронный поток: tracker потокобезопасен
        afk.touch(e.getPlayer().getUniqueId(), System.currentTimeMillis());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onCommand(PlayerCommandPreprocessEvent e) {
        afk.touch(e.getPlayer().getUniqueId(), System.currentTimeMillis());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInteract(PlayerInteractEvent e) {
        afk.touch(e.getPlayer().getUniqueId(), System.currentTimeMillis());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInteractEntity(PlayerInteractEntityEvent e) {
        afk.touch(e.getPlayer().getUniqueId(), System.currentTimeMillis());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInventoryClick(InventoryClickEvent e) {
        afk.touch(e.getWhoClicked().getUniqueId(), System.currentTimeMillis());
    }

    // ---- асинхронный поток ----

    private void sendTick() {
        if (!sending.compareAndSet(false, true)) return;
        try {
            sender.runOnce();
        } catch (RuntimeException ex) {
            getLogger().warning("Ошибка цикла отправки: " + ex.getClass().getSimpleName());
        } finally {
            sending.set(false);
        }
    }

    // ---- фаза 2: билеты, прогресс, PlaceholderAPI ----

    private static final long PROGRESS_TICKS = 20L * 60L;

    private void initPhase2(FileConfiguration cfg, SenderConfig.Result res) {
        api = new GiveawayApi(res.ok() ? res.config() : null, new JdkTransport(), System::currentTimeMillis);
        progress = new ProgressService(api, new QualifyNotifier(getDataFolder().toPath().resolve("notified.txt")));
        ServiceSettings st = ServiceSettings.resolve(System.getenv());
        cooldown = new Cooldown(st.cooldownSeconds() * 1000L);
        java.util.List<String> legacy = ServiceSettings.legacyKeysPresent(cfg.getKeys(false));
        if (!legacy.isEmpty()) {
            getLogger().warning("В config.yml найдены устаревшие ключи " + legacy + ": они игнорируются. Дата старта, окончания и порог берутся с сайта; служебные настройки заданы в коде. Удалите эти ключи.");
        }
        progressEnabled = st.progressEnabled();
        notifyEnabled = st.notifyEnabled();
        if (progressEnabled && api.configured()) {
            progressTask = getServer().getScheduler().runTaskTimer(this, this::progressTick, PROGRESS_TICKS, PROGRESS_TICKS);
        }
        if (getServer().getPluginManager().getPlugin("PlaceholderAPI") != null) {
            try {
                if (new GiveawayExpansion(progress, getDescription().getVersion()).register()) {
                    getLogger().info("PlaceholderAPI: зарегистрировано расширение twomcgiveaway.");
                }
            } catch (LinkageError | RuntimeException e) {
                getLogger().warning("PlaceholderAPI найден, но расширение не зарегистрировано: " + e.getClass().getSimpleName());
            }
        }
    }

    /** Главный поток: собрать онлайн-игроков, дальше сеть в асинхронной задаче. */
    private void progressTick() {
        if (progress.shouldSkipCycle()) return;
        if (!polling.compareAndSet(false, true)) return;
        List<UUID> online = new java.util.ArrayList<>();
        for (Player p : Bukkit.getOnlinePlayers()) online.add(p.getUniqueId());
        if (online.isEmpty()) {
            polling.set(false);
            return;
        }
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
            try {
                List<PlayerProgress> toNotify = progress.poll(online, System.currentTimeMillis());
                if (notifyEnabled && !toNotify.isEmpty()) {
                    getServer().getScheduler().runTask(this, () -> {
                        for (PlayerProgress pp : toNotify) {
                            Player pl = Bukkit.getPlayer(pp.uuid());
                            if (pl != null) show(pl, Messages.qualified(pp.thresholdMinutes()), true);
                        }
                    });
                }
            } catch (RuntimeException ex) {
                getLogger().warning("Ошибка опроса прогресса: " + ex.getClass().getSimpleName());
            } finally {
                polling.set(false);
            }
        });
    }

    /** Только главный поток. Sound.ENTITY_PLAYER_LEVELUP: статическое поле, работает и как enum (до 1.21.2), и как интерфейс. */
    private void show(Player pl, Messages.Reply r, boolean sound) {
        for (String line : r.chat()) pl.sendMessage(line);
        if (r.title() != null) pl.sendTitle(r.title(), r.subtitle() == null ? "" : r.subtitle(), 10, 80, 20);
        if (sound) pl.playSound(pl.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.0f);
    }

    private boolean redeemCommand(CommandSender who, String[] args) {
        if (!(who instanceof Player pl)) {
            who.sendMessage(Messages.PLAYERS_ONLY);
            return true;
        }
        if (args.length == 0) {
            pl.sendMessage(Messages.USAGE);
            return true;
        }
        if (!api.configured()) {
            pl.sendMessage(Messages.LATER);
            return true;
        }
        // код может быть записан с пробелами («ABCD EFGH ...»): склеиваем аргументы
        String code = CodeNormalizer.normalize(String.join("", args));
        long now = System.currentTimeMillis();
        if (!cooldown.tryAcquire(pl.getUniqueId(), now)) {
            pl.sendMessage(Messages.cooldown(cooldown.remainingSeconds(pl.getUniqueId(), now)));
            return true;
        }
        UUID id = pl.getUniqueId();
        String name = pl.getName();
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
            // неверный формат уходит с фиксированным нулевым кодом: сервер отвечает по порядку ADR (билет уже есть, мало времени, иначе invalid_code)
            RedeemResult rr = api.redeem(code != null ? code : "0000000000000000", id, name);
            getServer().getScheduler().runTask(this, () -> {
                Player p2 = Bukkit.getPlayer(id);
                if (p2 == null) return;
                if (rr.kind() == RedeemResult.Kind.ISSUED) {
                    progress.markTicket(id, rr.ticket());
                    show(p2, Messages.forRedeem(rr), true);
                } else {
                    if (rr.kind() == RedeemResult.Kind.REPEAT) progress.markTicket(id, rr.ticket());
                    show(p2, Messages.forRedeem(rr), false);
                }
            });
        });
        return true;
    }

    // ---- команда ----

    @Override
    public boolean onCommand(CommandSender who, Command cmd, String label, String[] args) {
        String name = cmd.getName().toLowerCase(java.util.Locale.ROOT);
        if (name.equals("giveaway") || name.equals("ticket")) return redeemCommand(who, args);
        if (!who.hasPermission("giveaway.admin")) {
            who.sendMessage("Недостаточно прав.");
            return true;
        }
        long now = System.currentTimeMillis();
        long oldest = queue.oldestMillis();
        who.sendMessage("Розыгрыш: статус плагина (ключ не показывается)");
        who.sendMessage("Отправка: " + (sender.configured() ? "настроена" : "ВЫКЛЮЧЕНА (" + configProblem + ")"));
        who.sendMessage("online-mode: " + (onlineMode ? "true" : "FALSE (риск подмены ника)"));
        who.sendMessage("В очереди: " + queue.size() + (oldest < 0 ? "" : ", самое старое " + ((now - oldest) / 60_000L) + " мин назад"));
        who.sendMessage("Отправлено за сессию: " + sender.sentTotal()
                + ", последний успех: " + (sender.lastSuccessAt() < 0 ? "нет" : Instant.ofEpochMilli(sender.lastSuccessAt())));
        String err = sender.lastError();
        who.sendMessage("Связь: " + (err.isEmpty() ? "ок" : "ошибка " + err + ", подряд неудач " + sender.consecutiveFailures()
                + ", след. попытка через " + Math.max(0, (sender.nextAttemptAt() - now) / 1000L) + " с"));
        who.sendMessage("Отброшено: переполнение " + queue.droppedOverflow() + ", старше 72 ч " + queue.droppedExpired()
                + ", в dead-letter " + queue.deadLettered() + ", отклонено сайтом (rejected) " + sender.rejectedTotal() + ", повреждённых строк " + queue.corruptLines()
                + ", неверный ник " + skippedInvalidName);
        who.sendMessage("Игроков под учётом AFK: " + afk.tracked());
        if (!progressEnabled) {
            who.sendMessage("Опрос прогресса: выключен (GIVEAWAY_PROGRESS_ENABLED=false)");
        } else if (!api.configured()) {
            who.sendMessage("Опрос прогресса: не работает, отправка не настроена");
        } else {
            long ls = progress.lastSuccessAt();
            who.sendMessage("Опрос прогресса: раз в минуту, успешных " + progress.pollsOk() + ", неудачных " + progress.pollsFailed()
                    + ", последний успех: " + (ls < 0 ? "нет" : Instant.ofEpochMilli(ls)) + ", игроков в последнем пакете " + progress.lastBatchSize()
                    + ", в кэше " + progress.cached());
            String pe = progress.lastError();
            who.sendMessage("Опрос связь: " + (pe.isEmpty() ? "ок" : "ошибка " + pe + ", подряд неудач " + progress.consecutiveFailures()));
        }
        return true;
    }
}
