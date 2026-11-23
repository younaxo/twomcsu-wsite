package ru.twomc.giveaway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SiteInfoTest {
    private static final UUID U = UUID.fromString("069a79f4-44e9-4726-a5be-fca90e38aaf5");
    private static final String BODY = "{\"thresholdMinutes\":3000,\"startAt\":\"2026-11-21T21:00:00.000Z\","
            + "\"cutoffAt\":\"2026-12-30T20:59:59.000Z\",\"startText\":\"22.11 00:00 по МСК\",\"cutoffText\":\"30.12 23:59 по МСК\","
            + "\"players\":[{\"playerUuid\":\"" + U + "\",\"minutes\":120,\"thresholdMinutes\":3000,"
            + "\"remainingMinutes\":2880,\"percent\":4,\"qualified\":false,\"ticket\":null}]}";

    @Test
    void parsesNewFields() {
        SiteInfo s = SiteInfo.parse(BODY);
        assertEquals(3000, s.thresholdMinutes());
        assertEquals("2026-11-21T21:00:00.000Z", s.startAt());
        assertEquals("2026-12-30T20:59:59.000Z", s.cutoffAt());
        assertEquals("22.11 00:00 по МСК", s.startText());
        assertEquals("30.12 23:59 по МСК", s.cutoffText());
        assertNull(SiteInfo.parse("garbage"));
        SiteInfo old = SiteInfo.parse("{\"thresholdMinutes\":3000,\"players\":[]}"); // ответ без новых полей
        assertEquals("", old.startText());
        assertEquals("—", PlaceholderFormat.resolve("start", null, old));
    }

    @Test
    void dashBeforeFirstResponse() {
        for (String k : List.of("start", "cutoff", "threshold_hours", "remaining")) {
            assertEquals("—", PlaceholderFormat.resolve(k, null, null), k);
        }
        assertEquals("0", PlaceholderFormat.resolve("hours", null, null));
        assertEquals("нет", PlaceholderFormat.resolve("qualified", null, null));
    }

    @Test
    void placeholdersFromSiteAnswer() {
        SiteInfo s = SiteInfo.parse(BODY);
        assertEquals("22.11 00:00 по МСК", PlaceholderFormat.resolve("start", null, s));
        assertEquals("30.12 23:59 по МСК", PlaceholderFormat.resolve("CUTOFF", null, s));
        assertEquals("50", PlaceholderFormat.resolve("threshold_hours", null, s));
        assertEquals("50:00", PlaceholderFormat.resolve("remaining", null, s));
    }

    @Test
    void progressServiceTakesSiteFromPoll() {
        Phase2Test.Fake t = new Phase2Test.Fake();
        t.response = BODY;
        SenderConfig cfg = SenderConfig.of(URI.create("https://giveaway.twomc.su/api/giveaway/v1/events"), "anarchy", 1, new byte[32]);
        ProgressService s = new ProgressService(new GiveawayApi(cfg, t, () -> 0L), new QualifyNotifier(null));
        assertNull(s.site());
        s.poll(List.of(U), 1000);
        assertEquals("30.12 23:59 по МСК", s.site().cutoffText());
        t.status = 503; // сбой не стирает последнее известное значение
        s.poll(List.of(U), 2000);
        assertEquals(3000, s.site().thresholdMinutes());
    }

    @Test
    void legacyConfigKeysDetectedAndEnvOverrides() {
        assertEquals(List.of("thresholdHoursDefault", "cutoffText", "progress"),
                ServiceSettings.legacyKeysPresent(Set.of("apiUrl", "progress", "cutoffText", "thresholdHoursDefault", "serverId")));
        assertTrue(ServiceSettings.legacyKeysPresent(Set.of("apiUrl", "serverId", "keyFile", "keyVersion")).isEmpty());
        ServiceSettings d = ServiceSettings.resolve(Map.of());
        assertEquals(5, d.cooldownSeconds());
        assertTrue(d.progressEnabled() && d.notifyEnabled());
        ServiceSettings e = ServiceSettings.resolve(Map.of("GIVEAWAY_COOLDOWN_SECONDS", "99", "GIVEAWAY_PROGRESS_NOTIFY", "false"));
        assertEquals(60, e.cooldownSeconds());
        assertTrue(!e.notifyEnabled());
        assertEquals(5, ServiceSettings.resolve(Map.of("GIVEAWAY_COOLDOWN_SECONDS", "x")).cooldownSeconds());
    }
}
