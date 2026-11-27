package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Ограничения частоты, нумерация (epoch, rev), пропуск неизменного, безопасный режим. Без Bukkit и сети. */
class TelemetryCoreTest {
    private static final String UUID1 = "069a79f4-44e9-4726-a5be-fca90e38aaf5";
    private static final long EPOCH = 1_799_999_000_000L;

    @TempDir
    Path dir;

    final class Harness {
        final TestScheduler sch = new TestScheduler();
        final DeliveryEngineTest.CapturingHandler logs = new DeliveryEngineTest.CapturingHandler();
        final List<EventPipeline.Pending> sent = new ArrayList<>();
        boolean blocked;
        final TelemetryCore core;

        Harness(TelemetryConfig cfg, Path epochFile) {
            Logger logger = Logger.getLogger("core-test-" + System.nanoTime());
            logger.setUseParentHandlers(false);
            logger.addHandler(logs);
            core = new TelemetryCore(cfg, sch, sch.now::get, logger, EPOCH, epochFile);
            core.attach(new TelemetryCore.Sink() {
                @Override
                public void submit(EventPipeline.Pending p) {
                    sent.add(p);
                }

                @Override
                public boolean blocked(String type) {
                    return blocked;
                }
            });
        }

        Harness() {
            this(enabled(), null);
        }

        long now() {
            return sch.now.get();
        }

        boolean inv(InventoryData main, InventoryData ender, boolean online) {
            boolean r = core.requestInventory(UUID1, main, ender, online, now(), false);
            sch.runDue();
            return r;
        }

        List<EventPipeline.Pending> inventoryEvents() {
            return sent.stream().filter(p -> p.type.equals(EventsProtocol.TYPE_INVENTORY)).toList();
        }
    }

    static TelemetryConfig enabled() {
        return TelemetryConfig.of(true, 10, "player", "off", true, 5, 30, 30);
    }

    static InventoryData group(String group, int items) {
        List<InventoryData.Slot> slots = new ArrayList<>();
        for (int i = 0; i < items; i++) {
            slots.add(new InventoryData.Slot(group.equals("ender") ? "ender" : "hotbar", i, InventoryData.Item.simple("minecraft:stone", i + 1)));
        }
        return new InventoryData(group, slots);
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> data(EventPipeline.Pending p) {
        return MiniJson.parseObject(p.dataJson);
    }

    // ---- выключено по умолчанию ----

    @Test
    void defaultConfigIsFullyDisabled() {
        TelemetryConfig cfg = TelemetryConfig.of(false, 10, "player", "off", false, 5, 30, 30);
        assertFalse(cfg.anyEnabled());
        Harness h = new Harness(cfg, null);
        assertFalse(h.core.requestStats(new StatsData(UUID1, 1L, 1L, 1L, null), h.now(), false));
        assertFalse(h.inv(group("main", 1), group("ender", 1), true));
        assertTrue(h.sent.isEmpty());
    }

    // ---- статистика ----

    @Test
    void statsAreThrottledAndOnlyContainWhitelistedKeys() {
        Harness h = new Harness();
        StatsData d = new StatsData(UUID1, 120L, 3L, 2L, null);
        assertTrue(h.core.requestStats(d, h.now(), false));
        assertEquals(1, h.sent.size());
        Map<String, Object> data = data(h.sent.get(0));
        assertEquals(Set.of("uuid", "metrics"), data.keySet());
        assertEquals(Set.of("playTimeMinutes", "kills", "deaths"), ((Map<?, ?>) data.get("metrics")).keySet());
        h.sch.advance(29_000);
        assertFalse(h.core.requestStats(d, h.now(), false), "чаще раза в 30 с на игрока нельзя");
        h.sch.advance(2_000);
        assertTrue(h.core.requestStats(d, h.now(), false));
        assertEquals(2, h.sent.size());
        assertTrue(h.core.requestStats(d, h.now(), true), "при остановке сервера ограничение обходится");
    }

    @Test
    void statsWithoutMetricsAreNotSent() {
        Harness h = new Harness();
        assertFalse(h.core.requestStats(new StatsData(UUID1, null, null, null, null), h.now(), false));
        assertTrue(h.sent.isEmpty());
    }

    @Test
    void statsPeriodicScheduleFollowsConfiguredInterval() {
        Harness h = new Harness();
        h.core.onJoin(UUID1, h.now(), 0);
        assertFalse(h.core.statsDue(UUID1, h.now() + 9 * 60_000L));
        assertTrue(h.core.statsDue(UUID1, h.now() + 10 * 60_000L));
        h.core.requestStats(new StatsData(UUID1, 1L, null, null, null), h.now() + 10 * 60_000L, false);
        assertFalse(h.core.statsDue(UUID1, h.now() + 10 * 60_000L + 1));
        h.core.onQuit(UUID1, h.now());
        assertFalse(h.core.statsDue(UUID1, h.now() + 60 * 60_000L), "вышедшего игрока по расписанию не опрашиваем");
    }

    @Test
    void blockedTypeProducesNothing() {
        Harness h = new Harness();
        h.blocked = true;
        assertFalse(h.core.requestStats(new StatsData(UUID1, 1L, null, null, null), h.now(), false));
        assertFalse(h.inv(group("main", 1), group("ender", 1), true));
        assertTrue(h.sent.isEmpty());
    }

    // ---- инвентарь ----

    @Test
    void inventorySendsMainAndEnderWithGrowingRevAndStableEpoch() {
        Harness h = new Harness();
        assertTrue(h.inv(group("main", 2), group("ender", 1), true));
        assertEquals(2, h.inventoryEvents().size());
        Map<String, Object> main = data(h.inventoryEvents().get(0));
        Map<String, Object> ender = data(h.inventoryEvents().get(1));
        assertEquals(Set.of("uuid", "group", "epoch", "rev", "capturedAt", "playerOnline", "schemaVersion", "slots"), main.keySet());
        assertEquals("main", main.get("group"));
        assertEquals("ender", ender.get("group"));
        assertEquals(EPOCH, main.get("epoch"));
        assertEquals(1L, main.get("rev"));
        assertEquals(2L, ender.get("rev"));
        assertEquals(1L, main.get("schemaVersion"));
        assertEquals(Boolean.TRUE, main.get("playerOnline"));
        assertTrue(((String) main.get("capturedAt")).matches("^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z$"));

        h.sch.advance(31_000);
        assertTrue(h.inv(group("main", 3), group("ender", 1), true));
        List<EventPipeline.Pending> all = h.inventoryEvents();
        long prev = 0;
        for (EventPipeline.Pending p : all) {
            long rev = (Long) data(p).get("rev");
            assertTrue(rev > prev, "rev строго растёт");
            prev = rev;
            assertEquals(EPOCH, data(p).get("epoch"));
        }
        assertEquals(4, all.size());
    }

    @Test
    void inventoryIsLimitedToOncePer30SecondsPerPlayer() {
        Harness h = new Harness();
        assertTrue(h.inv(group("main", 1), group("ender", 1), true));
        h.sch.advance(29_999);
        assertFalse(h.inv(group("main", 2), group("ender", 1), true));
        h.sch.advance(1);
        assertTrue(h.inv(group("main", 2), group("ender", 1), true));
        assertTrue(h.core.requestInventory(UUID1, group("main", 3), group("ender", 1), false, h.now(), true), "force при остановке");
    }

    @Test
    void configuredGapBelow30SecondsIsRaisedTo30() {
        TelemetryConfig cfg = TelemetryConfig.of(true, 10, "player", "off", true, 5, 5, 30);
        assertEquals(30_000L, cfg.inventoryMinGapMs);
        assertFalse(cfg.warnings.isEmpty());
    }

    @Test
    void unchangedInventoryIsNotResentUntilHeartbeat() {
        Harness h = new Harness();
        InventoryData main = group("main", 2);
        InventoryData ender = group("ender", 1);
        h.inv(main, ender, true);
        for (EventPipeline.Pending p : h.inventoryEvents()) h.core.onResult(p, "accepted", null);
        int before = h.sent.size();

        h.sch.advance(31_000);
        h.inv(main, ender, true);
        assertEquals(before, h.sent.size(), "состав не менялся и уже принят сайтом: не шлём");

        h.sch.advance(31_000);
        h.inv(main, ender, false);
        assertEquals(before + 2, h.sent.size(), "смена playerOnline - это изменение");
        for (EventPipeline.Pending p : h.inventoryEvents().subList(before, before + 2)) h.core.onResult(p, "accepted", null);

        h.sch.advance(31_000);
        h.inv(main, ender, false);
        assertEquals(before + 2, h.sent.size());
        h.sch.advance(31 * 60_000L);
        h.inv(main, ender, false);
        assertEquals(before + 4, h.sent.size(), "по heartbeat шлём даже без изменений");
    }

    @Test
    void notAcceptedInventoryIsRetriedNextRound() {
        Harness h = new Harness();
        h.inv(group("main", 1), group("ender", 1), true);
        h.sch.advance(31_000);
        h.inv(group("main", 1), group("ender", 1), true);
        assertEquals(4, h.sent.size(), "ответа об успехе не было: тот же состав шлётся снова");
    }

    @Test
    void oversizedSnapshotIsNotSentAndSizeIsLogged() {
        Harness h = new Harness();
        List<InventoryData.Slot> slots = new ArrayList<>();
        String loreLine = "x".repeat(110);
        for (int i = 0; i < 41; i++) {
            List<List<LegacyText.Run>> lore = new ArrayList<>();
            for (int k = 0; k < 5; k++) lore.add(LegacyText.parse(loreLine));
            InventoryData.Item it = new InventoryData.Item("minecraft:diamond_sword", 1, null, null, List.of(), List.of(), List.of(), lore,
                    null, null, false, null, null, null);
            String area = i < 9 ? "hotbar" : i < 36 ? "main" : "armor";
            int slot = i < 9 ? i : i < 36 ? i - 9 : i - 36;
            if (i == 40) { area = "offhand"; slot = 0; }
            slots.add(new InventoryData.Slot(area, slot, it));
        }
        h.inv(new InventoryData("main", slots), group("ender", 1), true);
        List<EventPipeline.Pending> inv = h.inventoryEvents();
        assertEquals(1, inv.size(), "огромный main не отправлен, маленький ender отправлен");
        assertEquals("ender", data(inv.get(0)).get("group"));
        assertTrue(h.logs.text.toString().contains("размер"), "в лог записан размер");
        for (EventPipeline.Pending p : inv) assertTrue(InventoryData.utf8Bytes(p.dataJson) <= 16384);
    }

    @Test
    void nothingContainsIpOrServerIdOrNbt() {
        Harness h = new Harness();
        h.inv(group("main", 3), group("ender", 3), true);
        for (EventPipeline.Pending p : h.inventoryEvents()) {
            String j = p.dataJson.toLowerCase();
            assertFalse(j.contains("\"ip\""));
            assertFalse(j.contains("serverid"));
            assertFalse(j.contains("nbt"));
        }
    }

    // ---- безопасный режим ----

    @Test
    void threeStaleInRowEnterSafeModeAndResumeStartsNewEpoch() throws Exception {
        Path epochFile = dir.resolve("inventory-epoch.txt");
        Harness h = new Harness(enabled(), epochFile);
        h.inv(group("main", 1), group("ender", 1), true);
        EventPipeline.Pending main = h.inventoryEvents().get(0);
        h.core.onResult(main, "stale", null);
        h.core.onResult(main, "stale", null);
        assertFalse(h.core.safeMode());
        h.core.onResult(main, "stale", null);
        assertTrue(h.core.safeMode());
        assertTrue(h.logs.text.toString().contains("БЕЗОПАСНЫЙ РЕЖИМ"));

        h.sch.advance(31_000);
        int before = h.sent.size();
        assertFalse(h.inv(group("main", 2), group("ender", 1), true), "в безопасном режиме инвентарь не отправляется");
        assertEquals(before, h.sent.size());
        assertTrue(h.core.requestStats(new StatsData(UUID1, 1L, null, null, null), h.now(), false), "статистика продолжает работать");

        h.sch.advance(1_000);
        String msg = h.core.resumeInventory(h.now());
        assertNotNull(msg);
        assertFalse(h.core.safeMode());
        assertEquals(h.now(), h.core.status().epoch());
        assertEquals(0L, h.core.status().rev());
        assertEquals(Long.toString(h.now()), Files.readString(epochFile, StandardCharsets.UTF_8));
        h.sch.advance(31_000);
        assertTrue(h.inv(group("main", 2), group("ender", 1), true));
        assertEquals(1L, data(h.inventoryEvents().get(h.inventoryEvents().size() - 2)).get("rev"));
    }

    @Test
    void staleStreakResetsOnAccepted() {
        Harness h = new Harness();
        h.inv(group("main", 1), group("ender", 1), true);
        EventPipeline.Pending main = h.inventoryEvents().get(0);
        h.core.onResult(main, "stale", null);
        h.core.onResult(main, "stale", null);
        h.core.onResult(main, "accepted", null);
        h.core.onResult(main, "stale", null);
        h.core.onResult(main, "stale", null);
        assertFalse(h.core.safeMode());
    }

    @Test
    void repeatedInvalidDataEntersSafeModeButAcceptedResetsCounter() {
        Harness h = new Harness();
        h.inv(group("main", 1), group("ender", 1), true);
        EventPipeline.Pending p = h.inventoryEvents().get(0);
        for (int i = 0; i < TelemetryCore.INVALID_LIMIT - 1; i++) h.core.onResult(p, "rejected", "invalid_data");
        h.core.onResult(p, "accepted", null);
        for (int i = 0; i < TelemetryCore.INVALID_LIMIT - 1; i++) h.core.onResult(p, "rejected", "invalid_data");
        assertFalse(h.core.safeMode());
        h.core.onResult(p, "rejected", "invalid_data");
        assertTrue(h.core.safeMode());
    }

    @Test
    void epochOutOfRangeEntersSafeModeImmediately() {
        Harness h = new Harness();
        h.inv(group("main", 1), group("ender", 1), true);
        h.core.onResult(h.inventoryEvents().get(0), "rejected", "epoch_out_of_range");
        assertTrue(h.core.safeMode());
    }

    @Test
    void statsResultsDoNotAffectInventorySafeMode() {
        Harness h = new Harness();
        h.core.requestStats(new StatsData(UUID1, 1L, null, null, null), h.now(), false);
        for (int i = 0; i < 10; i++) h.core.onResult(h.sent.get(0), "rejected", "invalid_data");
        assertFalse(h.core.safeMode());
    }

    @Test
    void housekeepingRemindsAboutSafeModeOncePerHour() {
        Harness h = new Harness();
        h.inv(group("main", 1), group("ender", 1), true);
        h.core.onResult(h.inventoryEvents().get(0), "rejected", "epoch_out_of_range");
        String before = h.logs.text.toString();
        h.core.housekeeping(h.now() + 10 * 60_000L);
        assertEquals(before, h.logs.text.toString());
        h.core.housekeeping(h.now() + 61 * 60_000L);
        assertTrue(h.logs.text.length() > before.length());
    }
}
