package ru.twomc.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.bukkit.Statistic;
import org.bukkit.block.Container;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;
import org.bukkit.inventory.meta.BlockStateMeta;
import org.bukkit.inventory.meta.Damageable;
import org.bukkit.inventory.meta.EnchantmentStorageMeta;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.inventory.meta.LeatherArmorMeta;
import org.bukkit.inventory.meta.PotionMeta;

/**
 * Единственное место, где данные читаются из Bukkit. Вызывать ТОЛЬКО из главного потока сервера: Player,
 * ItemStack и ItemMeta не потокобезопасны. Результат - простые неизменяемые копии ({@link StatsData},
 * {@link InventoryData}); дальше они передаются в поток ввода-вывода без ссылок на объекты сервера.
 * Читаются только поля белого списка контракта; сырой NBT, IP и координаты не читаются вообще.
 */
final class BukkitCollector {
    private BukkitCollector() {}

    /** Ticks в Statistic.PLAY_ONE_MINUTE (несмотря на название): 20 тиков в секунду, 1200 в минуту. */
    static final long TICKS_PER_MINUTE = 1200L;

    // ---- статистика ----

    static StatsData stats(Player p, TelemetryConfig cfg) {
        Long ticks = stat(p, "PLAY_ONE_MINUTE", "PLAY_TIME");
        Long minutes = ticks == null ? null : ticks / TICKS_PER_MINUTE;
        Long kills = stat(p, "PLAYER_KILLS");
        if (kills != null && cfg.killsMode == TelemetryConfig.KillsMode.ALL) {
            Long mobs = stat(p, "MOB_KILLS");
            if (mobs != null) kills += mobs;
        }
        Long deaths = stat(p, "DEATHS");
        Long hits = cfg.hitsMode == TelemetryConfig.HitsMode.DAMAGE_DEALT ? stat(p, "DAMAGE_DEALT") : null;
        return new StatsData(p.getUniqueId().toString(), minutes, kills, deaths, hits);
    }

    /** Значение статистики по первому подошедшему имени (имена различаются между версиями API) или null. */
    private static Long stat(Player p, String... names) {
        for (String name : names) {
            try {
                Statistic s = Statistic.valueOf(name);
                return (long) p.getStatistic(s);
            } catch (IllegalArgumentException | LinkageError ignored) {
                // нет такой статистики в этой версии: пробуем следующее имя
            }
        }
        return null;
    }

    // ---- инвентарь ----

    /** Основной инвентарь: хотбар (0-8), main (0-26), броня (0-3, порядок Bukkit: ботинки..шлем), вторая рука. */
    static InventoryData mainGroup(Player p) {
        PlayerInventory inv = p.getInventory();
        List<InventoryData.Slot> slots = new ArrayList<>();
        ItemStack[] storage = inv.getStorageContents();
        for (int i = 0; i < storage.length && i < 36; i++) {
            InventoryData.Item it = item(storage[i]);
            if (it == null) continue;
            if (i < 9) slots.add(new InventoryData.Slot("hotbar", i, it));
            else slots.add(new InventoryData.Slot("main", i - 9, it));
        }
        ItemStack[] armor = inv.getArmorContents();
        for (int i = 0; i < armor.length && i < 4; i++) {
            InventoryData.Item it = item(armor[i]);
            if (it != null) slots.add(new InventoryData.Slot("armor", i, it));
        }
        InventoryData.Item off = item(inv.getItemInOffHand());
        if (off != null) slots.add(new InventoryData.Slot("offhand", 0, off));
        return new InventoryData("main", slots);
    }

    static InventoryData enderGroup(Player p) {
        Inventory ender = p.getEnderChest();
        List<InventoryData.Slot> slots = new ArrayList<>();
        ItemStack[] contents = ender.getContents();
        for (int i = 0; i < contents.length && i < 27; i++) {
            InventoryData.Item it = item(contents[i]);
            if (it != null) slots.add(new InventoryData.Slot("ender", i, it));
        }
        return new InventoryData("ender", slots);
    }

    /** null для пустого слота. Любая ошибка чтения одного предмета даёт «простой» предмет, а не обрыв снимка. */
    static InventoryData.Item item(ItemStack s) {
        if (s == null || s.getType().isAir() || s.getAmount() <= 0) return null;
        String id = s.getType().getKey().toString();
        int count = s.getAmount();
        try {
            return detailed(s, id, count);
        } catch (RuntimeException | LinkageError e) {
            return InventoryData.Item.simple(id, count);
        }
    }

    private static InventoryData.Item detailed(ItemStack s, String id, int count) {
        ItemMeta meta = s.getItemMeta();
        if (meta == null) return InventoryData.Item.simple(id, count);

        Integer damage = null;
        if (meta instanceof Damageable dm && dm.hasDamage()) damage = dm.getDamage();
        int maxDur = s.getType().getMaxDurability();
        Integer maxDamage = maxDur > 0 ? maxDur : null;

        List<InventoryData.Ench> enchants = new ArrayList<>();
        for (Map.Entry<Enchantment, Integer> e : meta.getEnchants().entrySet()) {
            enchants.add(new InventoryData.Ench(e.getKey().getKey().toString(), e.getValue()));
        }
        List<InventoryData.Ench> stored = new ArrayList<>();
        if (meta instanceof EnchantmentStorageMeta sm) {
            for (Map.Entry<Enchantment, Integer> e : sm.getStoredEnchants().entrySet()) {
                stored.add(new InventoryData.Ench(e.getKey().getKey().toString(), e.getValue()));
            }
        }

        List<LegacyText.Run> name = meta.hasDisplayName() ? LegacyText.parse(meta.getDisplayName()) : List.of();
        List<List<LegacyText.Run>> lore = new ArrayList<>();
        List<String> rawLore = meta.hasLore() ? meta.getLore() : null;
        if (rawLore != null) {
            for (String line : rawLore) lore.add(LegacyText.parse(line));
        }

        Integer cmd = null;
        try {
            if (meta.hasCustomModelData()) cmd = meta.getCustomModelData();
        } catch (RuntimeException | LinkageError ignored) {
            // API без этого метода на другой версии ядра: поле необязательное
        }

        Integer dye = null;
        if (meta instanceof LeatherArmorMeta lm && lm.getColor() != null) dye = lm.getColor().asRGB();

        String potion = null;
        if (meta instanceof PotionMeta pm) {
            try {
                if (pm.getBasePotionType() != null) potion = pm.getBasePotionType().getKey().toString();
            } catch (RuntimeException | LinkageError ignored) {
                // необязательное поле
            }
        }

        Integer container = null;
        if (meta instanceof BlockStateMeta bsm && bsm.hasBlockState() && bsm.getBlockState() instanceof Container c) {
            int n = 0;
            for (ItemStack in : c.getInventory().getContents()) {
                if (in != null && !in.getType().isAir()) n++;
            }
            container = Math.min(n, 64);
        }

        // itemsAdderId не читается: нужен API стороннего плагина (новых зависимостей нет), поле необязательное.
        return new InventoryData.Item(id, count, damage, maxDamage, enchants, stored, name, lore, cmd, null,
                meta.isUnbreakable(), dye, potion, container);
    }
}
