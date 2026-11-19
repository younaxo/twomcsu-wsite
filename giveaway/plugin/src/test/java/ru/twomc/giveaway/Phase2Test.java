package ru.twomc.giveaway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Phase2Test {
    private static final UUID U = UUID.fromString("069a79f4-44e9-4726-a5be-fca90e38aaf5");

    // ---- нормализация: векторы бэкенда (giveaway-phase2.spec.ts) ----

    @Test
    void normalizeMatchesBackendVectors() {
        assertEquals("ABCDEFGHJKMNPQRS", CodeNormalizer.normalize("abcd-efgh-jkmn-pqrs"));
        assertEquals("0000111111110000", CodeNormalizer.normalize("oooo iiii llll 0000"));
        assertNull(CodeNormalizer.normalize("ABCD-EFGH-JKMN-PQRU")); // U недопустима
        assertNull(CodeNormalizer.normalize("ABCD"));
        assertNull(CodeNormalizer.normalize(null));
        assertNull(CodeNormalizer.normalize("A".repeat(65)));
        assertEquals("ABCDEFGHJKMNPQRS", CodeNormalizer.normalize("  ABCD EFGH\tJKMN-PQRS "));
    }

    // ---- разбор redeem ----

    @Test
    void redeemParsing() {
        RedeemResult r = RedeemResult.parse(200, "{\"status\":\"issued\",\"ticket\":\"K417\"}");
        assertEquals(RedeemResult.Kind.ISSUED, r.kind());
        assertEquals("K417", r.ticket());
        assertEquals(RedeemResult.Kind.REPEAT, RedeemResult.parse(200, "{\"status\":\"issued\",\"ticket\":\"K417\",\"repeat\":true}").kind());
        RedeemResult ne = RedeemResult.parse(200, "{\"status\":\"not_enough\",\"minutes\":725,\"remainingMinutes\":2275,\"thresholdMinutes\":3000}");
        assertEquals(RedeemResult.Kind.NOT_ENOUGH, ne.kind());
        assertEquals(725, ne.minutes());
        assertEquals(3000, ne.thresholdMinutes());
        assertEquals(RedeemResult.Kind.INVALID_CODE, RedeemResult.parse(200, "{\"status\":\"invalid_code\"}").kind());
        assertEquals(RedeemResult.Kind.NOT_STARTED, RedeemResult.parse(200, "{\"status\":\"not_started\"}").kind());
        assertEquals(RedeemResult.Kind.CLOSED, RedeemResult.parse(200, "{\"status\":\"closed\"}").kind());
    }

    @Test
    void redeemBadResponsesMeanRetryLater() {
        for (int st : new int[] {401, 403, 422, 429, 503, 500}) {
            assertEquals(RedeemResult.Kind.RETRY_LATER, RedeemResult.parse(st, "{\"status\":\"issued\",\"ticket\":\"K417\"}").kind());
        }
        assertEquals(RedeemResult.Kind.RETRY_LATER, RedeemResult.parse(200, "not json").kind());
        assertEquals(RedeemResult.Kind.RETRY_LATER, RedeemResult.parse(200, null).kind());
        assertEquals(RedeemResult.Kind.RETRY_LATER, RedeemResult.parse(200, "{\"status\":\"weird\"}").kind());
        assertEquals(RedeemResult.Kind.RETRY_LATER, RedeemResult.parse(200, "{\"status\":\"issued\",\"ticket\":\"I417\"}").kind()); // I недопустима
        assertEquals(RedeemResult.Kind.RETRY_LATER, RedeemResult.parse(200, "{\"status\":\"not_enough\",\"minutes\":1}").kind());
    }

    @Test
    void redeemMessages() {
        Messages.Reply ne = Messages.forRedeem(RedeemResult.parse(200,
                "{\"status\":\"not_enough\",\"minutes\":725,\"remainingMinutes\":2275,\"thresholdMinutes\":3000}"));
        assertTrue(ne.chat().get(0).contains("Набрано 12 ч 5 мин из 50 ч, осталось 37 ч 55 мин"));
        Messages.Reply issued = Messages.forRedeem(new RedeemResult(RedeemResult.Kind.ISSUED, "K417", 0, 0, 0));
        assertTrue(issued.title().contains("K417"));
        assertTrue(Messages.forRedeem(new RedeemResult(RedeemResult.Kind.REPEAT, "K417", 0, 0, 0)).chat().get(0).contains("Ваш билет: §6§lK417"));
        assertTrue(Messages.forRedeem(RedeemResult.RETRY).chat().get(0).contains("Попробуйте позже"));
        assertTrue(Messages.forRedeem(new RedeemResult(RedeemResult.Kind.INVALID_CODE, null, 0, 0, 0)).chat().get(0)
                .contains("Код недействителен или устарел. Получите новый на giveaway.twomc.su"));
    }

    // ---- разбор progress ----

    private static final String PROGRESS = "{\"thresholdMinutes\":3000,\"players\":["
            + "{\"playerUuid\":\"069a79f4-44e9-4726-a5be-fca90e38aaf5\",\"minutes\":120,\"thresholdMinutes\":3000,"
            + "\"remainingMinutes\":2880,\"percent\":4,\"qualified\":false,\"ticket\":null},"
            + "{\"playerUuid\":\"not-a-uuid\",\"minutes\":1,\"thresholdMinutes\":3000,\"remainingMinutes\":1,\"percent\":0,\"qualified\":false,\"ticket\":null},"
            + "{\"playerUuid\":\"11111111-2222-3333-4444-555555555555\",\"minutes\":3100,\"thresholdMinutes\":3000,"
            + "\"remainingMinutes\":0,\"percent\":100,\"qualified\":true,\"ticket\":\"K417\"}]}";

    @Test
    void progressParsing() {
        Map<UUID, PlayerProgress> m = PlayerProgress.parse(200, PROGRESS);
        assertEquals(2, m.size()); // битый UUID пропущен
        PlayerProgress p = m.get(U);
        assertEquals(120, p.minutes());
        assertEquals(2880, p.remainingMinutes());
        assertEquals(4, p.percent());
        assertFalse(p.qualified());
        assertNull(p.ticket());
        assertEquals("K417", m.get(UUID.fromString("11111111-2222-3333-4444-555555555555")).ticket());
        assertTrue(PlayerProgress.parse(500, PROGRESS).isEmpty());
        assertTrue(PlayerProgress.parse(200, "garbage").isEmpty());
        assertTrue(PlayerProgress.parse(200, "{\"players\":5}").isEmpty());
    }

    // ---- однократное уведомление ----

    private static PlayerProgress prog(boolean q, String ticket) {
        return new PlayerProgress(U, q ? 3100 : 100, 3000, q ? 0 : 2900, q ? 100 : 3, q, ticket);
    }

    @Test
    void notifyOnlyOnce(@TempDir Path dir) {
        Path f = dir.resolve("notified.txt");
        QualifyNotifier n = new QualifyNotifier(f);
        assertFalse(n.shouldNotify(prog(false, null)));
        assertTrue(n.shouldNotify(prog(true, null)));
        assertFalse(n.shouldNotify(prog(true, null))); // повтор
        // рестарт: отметка из файла
        QualifyNotifier n2 = new QualifyNotifier(f);
        assertFalse(n2.shouldNotify(prog(true, null)));
        assertEquals(1, n2.size());
    }

    @Test
    void noNotifyWhenTicketExists() {
        QualifyNotifier n = new QualifyNotifier(null);
        assertFalse(n.shouldNotify(prog(true, "K417")));
    }

    private static final SiteInfo SITE = new SiteInfo(3000, "2026-11-21T21:00:00.000Z", "2026-12-30T20:59:59.000Z",
            "22.11 00:00 по МСК", "30.12 23:59 по МСК");

    // ---- плейсхолдеры ----

    @Test
    void placeholderFormatting() {
        PlayerProgress p = new PlayerProgress(U, 725, 3000, 2275, 24, false, null);
        assertEquals("12", PlaceholderFormat.resolve("hours", p, SITE));
        assertEquals("5", PlaceholderFormat.resolve("minutes", p, SITE));
        assertEquals("37:55", PlaceholderFormat.resolve("remaining", p, SITE));
        assertEquals("24", PlaceholderFormat.resolve("percent", p, SITE));
        assertEquals("нет", PlaceholderFormat.resolve("qualified", p, SITE));
        assertEquals("-", PlaceholderFormat.resolve("ticket", p, SITE));
        assertEquals("50", PlaceholderFormat.resolve("threshold_hours", p, SITE));
        assertNull(PlaceholderFormat.resolve("unknown", p, SITE));
        PlayerProgress q = new PlayerProgress(U, 3100, 3000, 0, 100, true, "K417");
        assertEquals("да", PlaceholderFormat.resolve("qualified", q, SITE));
        assertEquals("K417", PlaceholderFormat.resolve("ticket", q, SITE));
        assertEquals("0:00", PlaceholderFormat.resolve("remaining", q, SITE));
        // без данных
        assertEquals("0", PlaceholderFormat.resolve("hours", null, SITE));
        assertEquals("0:05", PlaceholderFormat.clock(5));
        assertEquals("48:00", PlaceholderFormat.clock(2880));
        assertEquals("50.5", PlaceholderFormat.hours(3030));
    }

    // ---- кулдаун ----

    @Test
    void cooldown() {
        Cooldown c = new Cooldown(5000);
        assertTrue(c.tryAcquire(U, 1000));
        assertFalse(c.tryAcquire(U, 3000));
        assertEquals(3, c.remainingSeconds(U, 3000));
        assertTrue(c.tryAcquire(U, 6000));
    }

    // ---- подписанный запрос и опрос ----

    static final class Fake implements BatchSender.Transport {
        final List<URI> uris = new ArrayList<>();
        final List<Map<String, String>> headers = new ArrayList<>();
        final List<String> bodies = new ArrayList<>();
        int status = 200;
        String response = PROGRESS;
        boolean fail;

        @Override
        public BatchSender.Response post(URI uri, Map<String, String> h, byte[] body) throws IOException {
            if (fail) throw new IOException("down");
            uris.add(uri);
            headers.add(h);
            bodies.add(new String(body, java.nio.charset.StandardCharsets.UTF_8));
            return new BatchSender.Response(status, null, response);
        }
    }

    private static SenderConfig cfg() {
        return SenderConfig.of(URI.create("https://giveaway.twomc.su/api/giveaway/v1/events"), "anarchy", 1, new byte[32]);
    }

    @Test
    void redeemRequestIsSignedOnPublicPath() {
        Fake t = new Fake();
        t.response = "{\"status\":\"issued\",\"ticket\":\"K417\"}";
        GiveawayApi api = new GiveawayApi(cfg(), t, () -> 1_700_000_000_000L);
        RedeemResult r = api.redeem("ABCDEFGHJKMNPQRS", U, "Steve");
        assertEquals(RedeemResult.Kind.ISSUED, r.kind());
        assertEquals("https://giveaway.twomc.su/api/giveaway/v1/redeem", t.uris.get(0).toString());
        assertEquals("{\"code\":\"ABCDEFGHJKMNPQRS\",\"playerUuid\":\"" + U + "\",\"playerName\":\"Steve\"}", t.bodies.get(0));
        Map<String, String> h = t.headers.get(0);
        String expected = Signer.sign(new byte[32], "anarchy.1", "1700000000", h.get(Protocol.HEADER_NONCE), "POST",
                "/api/giveaway/v1/redeem", t.bodies.get(0).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals(expected, h.get(Protocol.HEADER_SIGNATURE));
    }

    @Test
    void redeemNetworkErrorMeansRetryLater() {
        Fake t = new Fake();
        t.fail = true;
        assertEquals(RedeemResult.Kind.RETRY_LATER, new GiveawayApi(cfg(), t, () -> 0L).redeem("ABCDEFGHJKMNPQRS", U, "Steve").kind());
        assertEquals(RedeemResult.Kind.RETRY_LATER, new GiveawayApi(null, t, () -> 0L).redeem("ABCDEFGHJKMNPQRS", U, "Steve").kind());
    }

    @Test
    void pollUpdatesCacheAndNotifiesOnce() {
        Fake t = new Fake();
        t.response = "{\"thresholdMinutes\":3000,\"players\":[{\"playerUuid\":\"" + U
                + "\",\"minutes\":3000,\"thresholdMinutes\":3000,\"remainingMinutes\":0,\"percent\":100,\"qualified\":true,\"ticket\":null}]}";
        ProgressService s = new ProgressService(new GiveawayApi(cfg(), t, () -> 0L), new QualifyNotifier(null));
        List<PlayerProgress> n1 = s.poll(List.of(U), 1000);
        assertEquals(1, n1.size());
        assertTrue(s.get(U).qualified());
        assertTrue(s.poll(List.of(U), 61_000).isEmpty());
        assertEquals("/api/giveaway/v1/progress", t.uris.get(0).getPath());
        assertEquals("{\"uuids\":[\"" + U + "\"]}", t.bodies.get(0));
        assertEquals(2, s.pollsOk());
        assertEquals("", s.lastError());
    }

    @Test
    void pollFailureBacksOff() {
        Fake t = new Fake();
        t.status = 503;
        ProgressService s = new ProgressService(new GiveawayApi(cfg(), t, () -> 0L), new QualifyNotifier(null));
        assertTrue(s.poll(List.of(U), 1000).isEmpty());
        assertEquals("http 503", s.lastError());
        assertEquals(1, s.consecutiveFailures());
        assertFalse(s.shouldSkipCycle()); // после первой ошибки пауза 0 циклов
        s.poll(List.of(U), 2000);
        assertTrue(s.shouldSkipCycle()); // после второй пропускается один цикл
        assertFalse(s.shouldSkipCycle());
        t.status = 200;
        s.poll(List.of(U), 3000);
        assertEquals(0, s.consecutiveFailures());
    }

    @Test
    void pollSplitsIntoBatchesOf100() {
        Fake t = new Fake();
        t.response = "{\"thresholdMinutes\":3000,\"players\":[]}";
        ProgressService s = new ProgressService(new GiveawayApi(cfg(), t, () -> 0L), new QualifyNotifier(null));
        List<UUID> many = new ArrayList<>();
        for (int i = 0; i < 250; i++) many.add(new UUID(0, i));
        s.poll(many, 0);
        assertEquals(3, t.bodies.size());
    }
}
