package ru.twomc.giveaway;

import java.util.Map;

/**
 * Параметры розыгрыша из ответа сайта POST /progress (ADR-G002 п. 6.2): порог, даты старта и окончания.
 * Единственный источник этих значений; в config.yml их нет. Тексты (МСК) готовит сайт.
 */
public record SiteInfo(long thresholdMinutes, String startAt, String cutoffAt, String startText, String cutoffText) {

    /** @return null, если корень не объект; отсутствующие поля дают 0 или пустую строку (плейсхолдер покажет «—»). */
    public static SiteInfo parse(String body) {
        Map<String, Object> root = MiniJson.parseObject(body);
        if (root == null) return null;
        long th = RedeemResult.num(root.get("thresholdMinutes"));
        return new SiteInfo(Math.max(0, th), str(root.get("startAt")), str(root.get("cutoffAt")),
                str(root.get("startText")), str(root.get("cutoffText")));
    }

    private static String str(Object o) {
        return o instanceof String s && s.length() <= 64 ? s.strip() : "";
    }
}
