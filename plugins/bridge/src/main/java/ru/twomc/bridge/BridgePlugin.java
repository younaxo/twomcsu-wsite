package ru.twomc.bridge;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * TwoMC Bridge, срез «выдача заказов» (контракт docs/stage-03/BRIDGE-CONTRACT.md, раздел 14).
 * Стабильный Spigot API 1.21.4, без NMS и Paper-API. Выдача по умолчанию ВЫКЛЮЧЕНА.
 *
 * <p>Потоки: HTTP и циклы работают на собственном daemon-потоке; команды исполняются только в главном
 * потоке через {@code Bukkit.dispatchCommand(консоль, ...)}.
 */
public final class BridgePlugin extends JavaPlugin {
    private static final long START_DELAY_MS = 10_000;

    private DeliveryEngine engine;
    private KeyStore store;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        FileConfiguration cfg = getConfig();
        if (!cfg.getBoolean("delivery.enabled", false)) {
            getLogger().info("Выдача заказов выключена (delivery.enabled: false). Плагин ничего не опрашивает.");
            return;
        }

        BridgeConfig.Raw raw = new BridgeConfig.Raw(
                cfg.getString("delivery.siteUrl", ""),
                cfg.getString("delivery.keyId", ""),
                cfg.getString("delivery.keyFile", ""),
                cfg.getStringList("delivery.extraRoots"),
                cfg.getStringList("delivery.extraTemplates"),
                cfg.getInt("delivery.maxPerClaim", 5),
                cfg.getInt("delivery.keyRetentionDays", 180));
        BridgeConfig.Result res = BridgeConfig.resolve(raw, System.getenv(), getDataFolder().toPath());
        if (!res.ok()) {
            getLogger().warning("Выдача заказов ВЫКЛЮЧЕНА из-за настроек: " + res.problem());
            return;
        }
        BridgeConfig conf = res.config();
        for (String w : res.warnings()) {
            getLogger().warning(w);
        }

        try {
            store = FileKeyStore.open(getDataFolder().toPath(), System::currentTimeMillis, conf.keyRetentionMs, getLogger());
        } catch (IOException | RuntimeException e) {
            // Без журнала ключей выдавать нельзя: двойная выдача (R167).
            boolean locked = e instanceof JournalBusyException;
            getLogger().severe("Выдача заказов ВЫКЛЮЧЕНА: журнал ключей недоступен ("
                    + (locked ? "уже занят другим экземпляром плагина" : e.getClass().getSimpleName()) + ").");
            store = null;
            return;
        }

        Scheduler scheduler = new Scheduler.Pool("TwoMCBridge-IO");
        BridgeApi api = new BridgeApi(conf.base, conf.keyId, conf.key(), new JdkTransport(Duration.ofSeconds(20)),
                System::currentTimeMillis);
        engine = new DeliveryEngine(api, store, conf.policy,
                r -> getServer().getScheduler().runTask(this, r),
                command -> Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command),
                scheduler, System::currentTimeMillis, () -> ThreadLocalRandom.current().nextDouble(),
                getLogger(), conf.maxPerClaim);
        engine.start(START_DELAY_MS);
        getLogger().info("Выдача заказов включена: " + conf + ", корни команд: " + conf.policy.roots()
                + ", ключей в журнале: " + store.size() + ".");
    }

    @Override
    public void onDisable() {
        if (engine != null) {
            engine.shutdown();
            engine = null;
        }
        if (store != null) {
            store.close();
            store = null;
        }
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!command.getName().equalsIgnoreCase("twomcbridge")) {
            return false;
        }
        if (args.length >= 1 && args[0].equalsIgnoreCase("status")) {
            if (engine == null) {
                sender.sendMessage("TwoMC Bridge: выдача заказов выключена или не запущена (см. лог при старте).");
                return true;
            }
            DeliveryEngine.Status s = engine.status();
            sender.sendMessage("TwoMC Bridge: журнал " + (s.storeHealthy() ? "исправен"
                    : store != null && store.corruptionPending() ? "ПОВРЕЖДЁН (нужен /twomcbridge ackcorrupt)" : "НЕДОСТУПЕН") + ", ключей " + s.storeSize()
                    + ", ack в очереди " + s.outbox() + ", заданий в работе " + s.inFlight()
                    + (s.pausedForMs() > 0 ? ", пауза ещё " + (s.pausedForMs() / 1000) + " с" : "") + ". Последнее: " + s.last());
            return true;
        }
        if (args.length == 2 && args[0].equalsIgnoreCase("forget")) {
            if (store == null) {
                sender.sendMessage("TwoMC Bridge: журнал ключей не открыт.");
                return true;
            }
            String key = args[1];
            if (!Protocol.IDEMPOTENCY_KEY.matcher(key).matches()) {
                sender.sendMessage("TwoMC Bridge: неверный формат ключа.");
                return true;
            }
            KeyStore.State st = store.state(key);
            if (st == KeyStore.State.DONE) {
                sender.sendMessage("TwoMC Bridge: ключ помечен как ВЫПОЛНЕННЫЙ, снять его нельзя (иначе двойная выдача).");
            } else if (st == KeyStore.State.STARTED || st == KeyStore.State.UNKNOWN) {
                boolean ok = store.forget(key);
                getLogger().warning("Оператор " + sender.getName() + " снял неизвестный исход ключа " + key + (ok ? "" : " (запись не удалась)"));
                sender.sendMessage(ok ? "TwoMC Bridge: ключ снят; следующий повтор админом на сайте выполнит команду. "
                        + "Делайте это только убедившись, что игрок НЕ получил выдачу."
                        : "TwoMC Bridge: запись в журнал не удалась.");
            } else {
                sender.sendMessage("TwoMC Bridge: для ключа нет блокирующей записи (состояние " + st + ").");
            }
            return true;
        }
        if ((args.length == 1 || args.length == 2) && args[0].equalsIgnoreCase("ackcorrupt")) {
            if (store == null) {
                sender.sendMessage("TwoMC Bridge: журнал ключей не открыт.");
                return true;
            }
            if (!store.corruptionPending()) {
                sender.sendMessage("TwoMC Bridge: подтверждать нечего, порча журнала не зафиксирована.");
                return true;
            }
            if (args.length != 2 || !args[1].equalsIgnoreCase("confirm")) {
                String copy = store.corruptionCopyName();
                sender.sendMessage("TwoMC Bridge: журнал ключей повреждён. Копия исходного файла: " + (copy == null ? "(не найдена)" : copy)
                        + ". Проверьте её: потерянная запись о выполненной выдаче даст двойную выдачу. "
                        + "Если риск принят, повторите: /twomcbridge ackcorrupt confirm");
                return true;
            }
            boolean ok = store.acknowledgeCorruption();
            getLogger().warning("Оператор " + sender.getName() + " подтвердил порчу журнала ключей" + (ok ? "" : " (перезапись не удалась)"));
            sender.sendMessage(ok
                    ? "TwoMC Bridge: порча подтверждена, журнал переписан, выдача возобновится в течение 30 секунд. "
                    + "Копия исходного файла осталась в executed-keys.log.bad-*."
                    : "TwoMC Bridge: перезапись журнала не удалась, выдача остаётся выключенной (см. лог).");
            return true;
        }
        sender.sendMessage("Использование: /twomcbridge status | forget <idempotencyKey> | ackcorrupt [confirm]");
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 2 && args[0].equalsIgnoreCase("ackcorrupt")) {
            return List.of("confirm");
        }
        return args.length == 1 ? List.of("status", "forget", "ackcorrupt") : List.of();
    }
}
