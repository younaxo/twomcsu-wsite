package ru.twomc.giveaway;

import java.util.List;

/** Тексты для игрока (чистые функции, без Bukkit). Цветовые коды § задаются литералами. */
public final class Messages {
    private Messages() {}

    /** Ответ игроку: строки чата и необязательный title/subtitle (null, если не нужен). */
    public record Reply(List<String> chat, String title, String subtitle) {
        public static Reply chat(String line) { return new Reply(List.of(line), null, null); }
    }

    public static final String USAGE = "§eИспользование: /giveaway <код>. Получите код на giveaway.twomc.su";
    public static final String PLAYERS_ONLY = "Команда только для игроков.";
    public static final String LATER = "§cПопробуйте позже.";
    public static final String INVALID = "§cКод недействителен или устарел. Получите новый на giveaway.twomc.su";

    /** «X ч Y мин» (минуты неотрицательны; нулевые части не скрываются, чтобы формат был предсказуем). */
    public static String duration(long minutes) {
        long m = Math.max(0, minutes);
        return (m / 60) + " ч " + (m % 60) + " мин";
    }

    public static String cooldown(long seconds) {
        return "§eПодождите " + Math.max(1, seconds) + " с перед следующей попыткой.";
    }

    public static Reply forRedeem(RedeemResult r) {
        switch (r.kind()) {
            case NOT_ENOUGH:
                return Reply.chat("§eНабрано " + duration(r.minutes()) + " из " + PlaceholderFormat.hours(r.thresholdMinutes())
                        + " ч, осталось " + duration(r.remainingMinutes()) + ".");
            case ISSUED:
                return ticketReply(r.ticket(), true);
            case REPEAT:
                return Reply.chat("§aВаш билет: §6§l" + r.ticket());
            case INVALID_CODE:
                return Reply.chat(INVALID);
            case NOT_STARTED:
                return Reply.chat("§eРозыгрыш ещё не начался.");
            case CLOSED:
                return Reply.chat("§eПриём билетов завершён.");
            default:
                return Reply.chat(LATER);
        }
    }

    /** Билет крупно: чат плюс title. */
    public static Reply ticketReply(String ticket, boolean issued) {
        return new Reply(
                List.of("§a§m                                ", "§aВаш билет в розыгрыше: §6§l" + ticket,
                        "§7Он показан и на странице giveaway.twomc.su", "§a§m                                "),
                "§6§l" + ticket, "§aВаш билет в розыгрыше");
    }

    /** Уведомление о достижении порога (однократное). */
    public static Reply qualified(long thresholdMinutes) {
        return new Reply(
                List.of("§aВы набрали " + PlaceholderFormat.hours(thresholdMinutes) + " ч онлайн!",
                        "§eПолучите код на giveaway.twomc.su и введите: §f/giveaway <код>"),
                "§6Порог набран!", "§eПолучите билет: /giveaway <код>");
    }
}
