package ru.twomc.giveaway;

import java.io.IOException;
import java.nio.file.Files;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.bukkit.Bukkit;
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
    }

    @Override
    public void onDisable() {
        if (heartbeatTask != null) heartbeatTask.cancel();
        if (sendTask != null) sendTask.cancel();
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

    // ---- команда ----

    @Override
    public boolean onCommand(CommandSender who, Command cmd, String label, String[] args) {
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
        return true;
    }
}
