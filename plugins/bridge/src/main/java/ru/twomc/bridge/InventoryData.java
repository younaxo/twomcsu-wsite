package ru.twomc.bridge;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Снимок группы слотов (main или ender) в виде простых данных (контракт 16.2). Создаётся в ГЛАВНОМ потоке сервера
 * копированием из Bukkit; дальше только чистые значения без ссылок на ItemStack, поэтому JSON и отправка идут вне
 * главного потока. Поля предмета - строго белый список схемы: id, count, damage, maxDamage, enchants, storedEnchants,
 * name, lore, customModelData, itemsAdderId, unbreakable, dyeColor, potion, containerItemCount. Сырого NBT нет.
 */
final class InventoryData {
    static final Pattern NAMESPACED_ID = Pattern.compile("^[a-z0-9_.-]+:[a-z0-9_./-]+$");
    static final int MAX_ITEM_BYTES = 600;
    static final int MAX_ENCHANTS = 32;
    static final int MAX_NAME_RUNS = 16;
    static final int MAX_LORE_LINES = 20;
    static final int MAX_LORE_RUNS = 16;
    static final int MAX_ITEM_TEXT_CHARS = 2000;

    record Ench(String id, int level) {}

    /** Предмет. Необязательные поля равны null или пусты. */
    record Item(String id, int count, Integer damage, Integer maxDamage, List<Ench> enchants, List<Ench> storedEnchants,
                List<LegacyText.Run> name, List<List<LegacyText.Run>> lore, Integer customModelData, String itemsAdderId,
                boolean unbreakable, Integer dyeColor, String potion, Integer containerItemCount) {
        static Item simple(String id, int count) {
            return new Item(id, count, null, null, List.of(), List.of(), List.of(), List.of(), null, null, false, null, null, null);
        }

        Item withLore(List<List<LegacyText.Run>> l) {
            return new Item(id, count, damage, maxDamage, enchants, storedEnchants, name, l, customModelData, itemsAdderId,
                    unbreakable, dyeColor, potion, containerItemCount);
        }

        Item withName(List<LegacyText.Run> n) {
            return new Item(id, count, damage, maxDamage, enchants, storedEnchants, n, lore, customModelData, itemsAdderId,
                    unbreakable, dyeColor, potion, containerItemCount);
        }

        Item withEnchants(List<Ench> e, List<Ench> s) {
            return new Item(id, count, damage, maxDamage, e, s, name, lore, customModelData, itemsAdderId,
                    unbreakable, dyeColor, potion, containerItemCount);
        }
    }

    record Slot(String area, int slot, Item item) {}

    final String group;
    final List<Slot> slots;

    InventoryData(String group, List<Slot> slots) {
        if (!group.equals("main") && !group.equals("ender")) throw new IllegalArgumentException("group");
        this.group = group;
        this.slots = List.copyOf(slots);
    }

    // ---- сборка JSON ----

    /** JSON массива слотов (без пустых слотов). Предметы, не укладывающиеся в схему, приводятся к допустимому виду. */
    String slotsJson() {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (Slot s : slots) {
            String item = itemJson(fit(s.item()));
            if (item == null) continue; // предмет с недопустимым id пропускаем: один странный предмет не должен ронять снимок
            if (!first) sb.append(',');
            first = false;
            sb.append("{\"area\":").append(DeliveryProtocol.quote(s.area())).append(",\"slot\":").append(s.slot())
                    .append(",\"item\":").append(item).append('}');
        }
        return sb.append(']').toString();
    }

    /** JSON {@code data} события inventory.snapshot (16.2). Поля ровно из белого списка: ни ip, ни serverId. */
    static String dataJson(String uuid, String group, long epoch, long rev, long capturedAtMs, boolean online, String slotsJson) {
        return "{\"uuid\":" + DeliveryProtocol.quote(uuid) + ",\"group\":" + DeliveryProtocol.quote(group)
                + ",\"epoch\":" + epoch + ",\"rev\":" + rev + ",\"capturedAt\":\"" + EventsProtocol.iso(capturedAtMs)
                + "\",\"playerOnline\":" + online + ",\"schemaVersion\":1,\"slots\":" + slotsJson + "}";
    }

    static int utf8Bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8).length;
    }

    // ---- приведение предмета к лимитам приёмника (зеркало inventory-normalize.ts) ----

    /** null, если id недопустим. */
    static Item fit(Item in) {
        if (in == null || !validId(in.id(), 64)) {
            return null;
        }
        List<Ench> ench = fitEnchants(in.enchants());
        List<Ench> stored = fitEnchants(in.storedEnchants());
        List<LegacyText.Run> name = in.name() == null ? List.of() : new ArrayList<>(in.name());
        if (name.size() > MAX_NAME_RUNS) name = new ArrayList<>(name.subList(0, MAX_NAME_RUNS));
        List<List<LegacyText.Run>> lore = new ArrayList<>();
        if (in.lore() != null) {
            for (List<LegacyText.Run> line : in.lore()) {
                if (lore.size() >= MAX_LORE_LINES) break;
                lore.add(line.size() > MAX_LORE_RUNS ? List.copyOf(line.subList(0, MAX_LORE_RUNS)) : line);
            }
        }
        while (!lore.isEmpty() && lore.get(lore.size() - 1).isEmpty()) lore.remove(lore.size() - 1);
        if (LegacyText.chars(name) > MAX_ITEM_TEXT_CHARS) name = List.of();
        while (!lore.isEmpty() && textChars(name, lore) > MAX_ITEM_TEXT_CHARS) lore.remove(lore.size() - 1);

        Item item = new Item(in.id(), clamp(in.count(), 1, 99), opt(in.damage(), 0, 100_000), opt(in.maxDamage(), 0, 100_000),
                ench, stored, name, lore, opt(in.customModelData(), 0, Integer.MAX_VALUE),
                validId(in.itemsAdderId(), 96) ? in.itemsAdderId() : null, in.unbreakable(), opt(in.dyeColor(), 0, 16_777_215),
                validId(in.potion(), 64) ? in.potion() : null, opt(in.containerItemCount(), 0, 64));
        // Предмет не больше 600 байт: сначала лор с конца (как делает сайт), затем имя, затем зачарования с конца.
        while (utf8Bytes(itemJson(item)) > MAX_ITEM_BYTES && !item.lore().isEmpty()) {
            List<List<LegacyText.Run>> l = new ArrayList<>(item.lore());
            l.remove(l.size() - 1);
            item = item.withLore(l);
        }
        if (utf8Bytes(itemJson(item)) > MAX_ITEM_BYTES && !item.name().isEmpty()) {
            item = item.withName(List.of());
        }
        while (utf8Bytes(itemJson(item)) > MAX_ITEM_BYTES && (!item.enchants().isEmpty() || !item.storedEnchants().isEmpty())) {
            List<Ench> e = new ArrayList<>(item.enchants());
            List<Ench> st = new ArrayList<>(item.storedEnchants());
            if (!e.isEmpty()) e.remove(e.size() - 1);
            else st.remove(st.size() - 1);
            item = item.withEnchants(e, st);
        }
        if (utf8Bytes(itemJson(item)) > MAX_ITEM_BYTES) {
            item = Item.simple(item.id(), item.count());
        }
        return item;
    }

    private static int textChars(List<LegacyText.Run> name, List<List<LegacyText.Run>> lore) {
        int n = LegacyText.chars(name);
        for (List<LegacyText.Run> l : lore) n += LegacyText.chars(l);
        return n;
    }

    private static List<Ench> fitEnchants(List<Ench> in) {
        List<Ench> out = new ArrayList<>();
        if (in == null) return out;
        for (Ench e : in) {
            if (out.size() >= MAX_ENCHANTS) break;
            if (e != null && validId(e.id(), 64)) out.add(new Ench(e.id(), clamp(e.level(), 1, 255)));
        }
        return out;
    }

    private static boolean validId(String s, int max) {
        return s != null && s.length() <= max && NAMESPACED_ID.matcher(s).matches();
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    private static Integer opt(Integer v, int min, int max) {
        return v == null ? null : clamp(v, min, max);
    }

    // ---- JSON предмета ----

    /** Компактный JSON предмета строго по белому списку полей; null для null. */
    static String itemJson(Item it) {
        if (it == null) return null;
        StringBuilder sb = new StringBuilder("{\"id\":").append(DeliveryProtocol.quote(it.id())).append(",\"count\":").append(it.count());
        if (it.damage() != null) sb.append(",\"damage\":").append(it.damage());
        if (it.maxDamage() != null) sb.append(",\"maxDamage\":").append(it.maxDamage());
        if (!it.enchants().isEmpty()) sb.append(",\"enchants\":").append(enchJson(it.enchants()));
        if (!it.storedEnchants().isEmpty()) sb.append(",\"storedEnchants\":").append(enchJson(it.storedEnchants()));
        if (!it.name().isEmpty()) sb.append(",\"name\":").append(runsJson(it.name()));
        if (!it.lore().isEmpty()) {
            sb.append(",\"lore\":[");
            for (int i = 0; i < it.lore().size(); i++) {
                if (i > 0) sb.append(',');
                sb.append(runsJson(it.lore().get(i)));
            }
            sb.append(']');
        }
        if (it.customModelData() != null) sb.append(",\"customModelData\":").append(it.customModelData());
        if (it.itemsAdderId() != null) sb.append(",\"itemsAdderId\":").append(DeliveryProtocol.quote(it.itemsAdderId()));
        if (it.unbreakable()) sb.append(",\"unbreakable\":true");
        if (it.dyeColor() != null) sb.append(",\"dyeColor\":").append(it.dyeColor());
        if (it.potion() != null) sb.append(",\"potion\":").append(DeliveryProtocol.quote(it.potion()));
        if (it.containerItemCount() != null) sb.append(",\"containerItemCount\":").append(it.containerItemCount());
        return sb.append('}').toString();
    }

    private static String enchJson(List<Ench> list) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"id\":").append(DeliveryProtocol.quote(list.get(i).id())).append(",\"level\":").append(list.get(i).level()).append('}');
        }
        return sb.append(']').toString();
    }

    private static String runsJson(List<LegacyText.Run> runs) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < runs.size(); i++) {
            LegacyText.Run r = runs.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"text\":").append(DeliveryProtocol.quote(r.text()));
            if (r.color() != null) sb.append(",\"color\":").append(DeliveryProtocol.quote(r.color()));
            if (r.bold()) sb.append(",\"bold\":true");
            if (r.italic()) sb.append(",\"italic\":true");
            if (r.underlined()) sb.append(",\"underlined\":true");
            if (r.strikethrough()) sb.append(",\"strikethrough\":true");
            if (r.obfuscated()) sb.append(",\"obfuscated\":true");
            sb.append('}');
        }
        return sb.append(']').toString();
    }
}
