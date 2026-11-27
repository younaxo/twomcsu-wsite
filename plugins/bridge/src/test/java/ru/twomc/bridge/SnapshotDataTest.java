package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Чистые данные снимков: eventId, конверт, статистика, предметы по белому списку, текст, настройки, эпоха. */
class SnapshotDataTest {
    @TempDir
    Path dir;

    // ---- UUIDv7 ----

    @Test
    void uuidV7HasKnownLayout() {
        assertEquals("0193f0a2-7c1e-7abc-8000-000000000000", UuidV7.generate(0x0193f0a27c1eL, () -> 0xFFFFFFFFFFFFFABCL, () -> 0L));
        assertEquals("0193f0a2-7c1e-7000-bfff-ffffffffffff", UuidV7.generate(0x0193f0a27c1eL, () -> 0L, () -> -1L));
    }

    @Test
    void uuidV7IsUniqueAndMatchesSiteEventIdFormat() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 2000; i++) {
            String id = UuidV7.generate(1_800_000_000_000L);
            assertTrue(id.matches("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"));
            assertTrue(id.matches("^[A-Za-z0-9_-]{26,64}$"), "формат eventId на сайте: ^[A-Za-z0-9_-]{26,64}$");
            seen.add(id);
        }
        assertEquals(2000, seen.size());
    }

    // ---- конверт ----

    @Test
    void isoMatchesToISOString() {
        assertEquals("1970-01-01T00:00:00.000Z", EventsProtocol.iso(0));
        assertEquals("2026-11-17T12:00:00.123Z", EventsProtocol.iso(java.time.Instant.parse("2026-11-17T12:00:00.123Z").toEpochMilli()));
    }

    @Test
    void serverIdIsKeyIdPrefix() {
        assertEquals("survival", EventsProtocol.serverIdOf("survival.12"));
        assertEquals("a1", EventsProtocol.serverIdOf("a1.1"));
    }

    @Test
    void parsesResultsAndRejectsGarbage() {
        List<EventsProtocol.EventResult> r = EventsProtocol.parse(
                "{\"results\":[{\"eventId\":\"a\",\"status\":\"accepted\"},{\"eventId\":\"b\",\"status\":\"rejected\",\"code\":\"invalid_data\"}],\"serverTime\":\"x\"}");
        assertEquals(2, r.size());
        assertEquals("invalid_data", r.get(1).code());
        assertNull(r.get(0).code());
        assertNull(EventsProtocol.parse("not json"));
        assertNull(EventsProtocol.parse("{\"results\":[1]}"));
        assertNull(EventsProtocol.parse("{\"other\":1}"));
    }

    // ---- статистика ----

    @Test
    void statsJsonHasOnlyUuidAndMetrics() {
        StatsData d = new StatsData("069a79f4-44e9-4726-a5be-fca90e38aaf5", 5L, 1L, null, null);
        assertEquals("{\"uuid\":\"069a79f4-44e9-4726-a5be-fca90e38aaf5\",\"metrics\":{\"playTimeMinutes\":5,\"kills\":1}}", d.toDataJson());
    }

    @Test
    void statsAreClampedToSiteLimits() {
        StatsData d = new StatsData("u", 6_000_000L, 200_000_000L, -5L, 2_000_000_000L);
        Map<String, Object> m = (Map<String, Object>) MiniJson.parseObject(d.toDataJson()).get("metrics");
        assertEquals(5_000_000L, m.get("playTimeMinutes"));
        assertEquals(100_000_000L, m.get("kills"));
        assertEquals(0L, m.get("deaths"));
        assertEquals(1_000_000_000L, m.get("hits"));
    }

    @Test
    void statsWithNoMetricsHaveNoJson() {
        assertNull(new StatsData("u", null, null, null, null).toDataJson());
    }

    // ---- текст ----

    @Test
    void legacyColorsBecomeRuns() {
        List<LegacyText.Run> runs = LegacyText.parse("§aHello §c§lBold§r plain");
        assertEquals(3, runs.size());
        assertEquals("green", runs.get(0).color());
        assertEquals("Hello ", runs.get(0).text());
        assertEquals("red", runs.get(1).color());
        assertTrue(runs.get(1).bold());
        assertNull(runs.get(2).color());
        assertFalse(runs.get(2).bold());
    }

    @Test
    void hexColorAndStrayCodes() {
        List<LegacyText.Run> runs = LegacyText.parse("§x§f§f§0§0§a§bHi§");
        assertEquals(1, runs.size());
        assertEquals("#FF00AB", runs.get(0).color());
        assertEquals("Hi", runs.get(0).text());
        assertTrue(LegacyText.parse("§").isEmpty());
        assertTrue(LegacyText.parse("").isEmpty());
        assertEquals("zq", LegacyText.parse("z§?q").stream().map(LegacyText.Run::text).reduce("", String::concat));
    }

    @Test
    void unsafeCharactersAndLongTextAreCleaned() {
        assertEquals("abc", LegacyText.sanitize("a\u0000b‮c​"));
        String longText = "ж".repeat(400);
        assertEquals(256, LegacyText.sanitize(longText).codePointCount(0, LegacyText.sanitize(longText).length()));
        assertEquals("ab", LegacyText.sanitize("a\uD800b"), "одинокий суррогат убирается");
    }

    // ---- предметы ----

    private static InventoryData.Item full() {
        return new InventoryData.Item("minecraft:diamond_sword", 1, 10, 1561,
                List.of(new InventoryData.Ench("minecraft:sharpness", 5)), List.of(new InventoryData.Ench("minecraft:mending", 1)),
                LegacyText.parse("§6Excalibur"), List.of(LegacyText.parse("§7Legend"), LegacyText.parse("line two")),
                1234, "ns:custom", true, 16711680, "minecraft:swiftness", 3);
    }

    @Test
    void itemJsonContainsOnlyWhitelistedFields() {
        Set<String> allowed = Set.of("id", "count", "damage", "maxDamage", "enchants", "storedEnchants", "name", "lore", "customModelData",
                "itemsAdderId", "unbreakable", "dyeColor", "potion", "containerItemCount");
        Map<String, Object> o = MiniJson.parseObject(InventoryData.itemJson(InventoryData.fit(full())));
        assertEquals(allowed, o.keySet(), "все 14 полей белого списка есть и ничего лишнего");
        assertFalse(o.containsKey("loreTruncated"));
        Map<String, Object> run = (Map<String, Object>) ((List<?>) o.get("name")).get(0);
        assertTrue(Set.of("text", "color", "bold", "italic", "underlined", "strikethrough", "obfuscated").containsAll(run.keySet()));
        Map<String, Object> minimal = MiniJson.parseObject(InventoryData.itemJson(InventoryData.Item.simple("minecraft:stone", 3)));
        assertEquals(Set.of("id", "count"), minimal.keySet());
    }

    @Test
    void invalidIdsAreSkippedInsteadOfBreakingTheSnapshot() {
        assertNull(InventoryData.fit(InventoryData.Item.simple("Minecraft:Stone", 1)));
        assertNull(InventoryData.fit(InventoryData.Item.simple("custom:item name", 1)));
        assertNull(InventoryData.fit(InventoryData.Item.simple("stone", 1)));
        assertNull(InventoryData.fit(InventoryData.Item.simple("minecraft:" + "a".repeat(60), 1)));
        InventoryData d = new InventoryData("main", List.of(
                new InventoryData.Slot("hotbar", 0, InventoryData.Item.simple("Bad:Id", 1)),
                new InventoryData.Slot("hotbar", 1, InventoryData.Item.simple("minecraft:stone", 1))));
        List<?> slots = (List<?>) MiniJson.parse(d.slotsJson());
        assertEquals(1, slots.size());
    }

    @Test
    void countIsClampedToSiteRange() {
        assertEquals(99, InventoryData.fit(InventoryData.Item.simple("minecraft:stone", 100)).count());
        assertEquals(1, InventoryData.fit(InventoryData.Item.simple("minecraft:stone", 0)).count());
    }

    @Test
    void heavyItemsAlwaysFitIntoSixHundredBytes() {
        List<List<LegacyText.Run>> lore = new ArrayList<>();
        for (int i = 0; i < 20; i++) lore.add(LegacyText.parse("§e" + "я".repeat(100)));
        List<InventoryData.Ench> ench = new ArrayList<>();
        for (int i = 0; i < 40; i++) ench.add(new InventoryData.Ench("minecraft:enchant_number_" + i + "_" + "x".repeat(20), 300));
        InventoryData.Item it = new InventoryData.Item("minecraft:netherite_chestplate", 1, null, null, ench, ench,
                LegacyText.parse("§b" + "ж".repeat(256)), lore, null, null, false, null, null, null);
        InventoryData.Item fitted = InventoryData.fit(it);
        assertNotNull(fitted);
        assertTrue(InventoryData.utf8Bytes(InventoryData.itemJson(fitted)) <= 600);
        assertEquals("minecraft:netherite_chestplate", fitted.id());
        assertTrue(fitted.enchants().size() <= 32);
        assertTrue(fitted.enchants().stream().allMatch(e -> e.level() <= 255));
    }

    @Test
    void loreIsDroppedFromTheEndFirst() {
        List<List<LegacyText.Run>> lore = new ArrayList<>();
        for (int i = 0; i < 10; i++) lore.add(LegacyText.parse("line " + i + " " + "z".repeat(80)));
        InventoryData.Item it = new InventoryData.Item("minecraft:stick", 1, null, null, List.of(), List.of(),
                LegacyText.parse("Name"), lore, null, null, false, null, null, null);
        InventoryData.Item fitted = InventoryData.fit(it);
        assertEquals(1, fitted.name().size(), "имя сохранено, лишнее ушло из лора");
        assertTrue(fitted.lore().size() < 10 && !fitted.lore().isEmpty());
        assertEquals("line 0 " + "z".repeat(80), fitted.lore().get(0).get(0).text(), "первые строки остаются");
    }

    @Test
    void realisticFullInventoryFitsSixteenKilobytes() {
        List<InventoryData.Slot> slots = new ArrayList<>();
        for (int i = 0; i < 41; i++) {
            InventoryData.Item it = i % 5 == 0 ? full() : InventoryData.Item.simple("minecraft:cobblestone", 64);
            String area = i < 9 ? "hotbar" : i < 36 ? "main" : "armor";
            int slot = i < 9 ? i : i < 36 ? i - 9 : i - 36;
            if (i == 40) { area = "offhand"; slot = 0; }
            slots.add(new InventoryData.Slot(area, slot, it));
        }
        InventoryData d = new InventoryData("main", slots);
        String json = InventoryData.dataJson("069a79f4-44e9-4726-a5be-fca90e38aaf5", "main", 1_800_000_000_000L, 1, 1_800_000_000_000L, true, d.slotsJson());
        assertTrue(InventoryData.utf8Bytes(json) <= 16384);
        Map<String, Object> o = MiniJson.parseObject(json);
        assertEquals(41, ((List<?>) o.get("slots")).size());
    }

    @Test
    void jsonStringsAreEscaped() {
        InventoryData.Item it = new InventoryData.Item("minecraft:stick", 1, null, null, List.of(), List.of(),
                List.of(new LegacyText.Run("a\"b\\c", null, false, false, false, false, false)), List.of(), null, null, false, null, null, null);
        Map<String, Object> o = MiniJson.parseObject(InventoryData.itemJson(it));
        assertEquals("a\"b\\c", ((Map<?, ?>) ((List<?>) o.get("name")).get(0)).get("text"));
    }

    @Test
    void groupNameIsValidated() {
        assertThrows(IllegalArgumentException.class, () -> new InventoryData("hotbar", List.of()));
    }

    // ---- настройки ----

    @Test
    void configClampsAndWarns() {
        TelemetryConfig c = TelemetryConfig.of(true, 0, "bogus", "bogus", true, 99999, 30, 1);
        assertEquals(60_000L, c.statsIntervalMs);
        assertEquals(TelemetryConfig.KillsMode.PLAYER, c.killsMode);
        assertEquals(TelemetryConfig.HitsMode.OFF, c.hitsMode);
        assertEquals(1440 * 60_000L, c.inventoryIntervalMs);
        assertEquals(c.inventoryIntervalMs, c.inventoryHeartbeatMs, "heartbeat не короче интервала");
        assertTrue(c.warnings.size() >= 4);
    }

    @Test
    void configParsesModes() {
        TelemetryConfig c = TelemetryConfig.of(true, 10, "ALL", "damage_dealt", false, 5, 30, 30);
        assertEquals(TelemetryConfig.KillsMode.ALL, c.killsMode);
        assertEquals(TelemetryConfig.HitsMode.DAMAGE_DEALT, c.hitsMode);
        assertTrue(c.warnings.isEmpty());
        assertTrue(c.anyEnabled());
    }

    @Test
    void shippedConfigYmlKeepsBothSnapshotsDisabled() throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/config.yml")) {
            assertNotNull(in);
            String yml = new String(in.readAllBytes(), StandardCharsets.UTF_8).replace("\r\n", "\n");
            assertTrue(yml.contains("\nstats:\n  enabled: false\n"), "stats.enabled по умолчанию false");
            assertTrue(yml.contains("\ninventory:\n  enabled: false\n"), "inventory.enabled по умолчанию false");
            assertTrue(yml.contains("\ndelivery:\n  # Выдача заказов. По умолчанию ВЫКЛЮЧЕНА."));
            assertTrue(yml.contains("minGapSeconds: 30"));
        }
    }

    // ---- эпоха ----

    @Test
    void epochIsMaxOfSavedPlusOneAndStartTime() throws IOException {
        Path f = dir.resolve("inventory-epoch.txt");
        Logger log = Logger.getLogger("epoch-test");
        assertEquals(1000L, EpochStore.next(f, 1000L, log), "нет файла: время старта");
        assertEquals("1000", Files.readString(f));
        assertEquals(1001L, EpochStore.next(f, 1000L, log), "тот же момент: saved + 1");
        assertEquals(5000L, EpochStore.next(f, 5000L, log));
        assertEquals(5001L, EpochStore.next(f, 4000L, log), "часы откатились: эпоха всё равно растёт");
    }

    @Test
    void corruptEpochFileFallsBackToStartTime() throws IOException {
        Path f = dir.resolve("inventory-epoch.txt");
        Files.writeString(f, "not a number");
        assertEquals(7000L, EpochStore.next(f, 7000L, Logger.getLogger("epoch-test2")));
    }
}
