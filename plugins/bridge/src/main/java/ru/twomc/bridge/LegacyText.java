package ru.twomc.bridge;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Разбор «старого» текста Minecraft с кодами {@code §} в прогоны (поля name и lore контракта 16.2). Прогон:
 * текст, необязательный цвет (имя из 16 или {@code #RRGGBB}) и булевы стили. Очистка зеркалит сайт
 * (inventory-text.ts): NFC, без управляющих и bidi-символов, текст прогона не длиннее 256 символов.
 * Никакого NBT, кликов и hover-событий: их здесь нет по построению.
 */
final class LegacyText {
    static final int MAX_RUN_CHARS = 256;

    private static final Pattern UNSAFE = Pattern.compile(
            "[\\x{0}-\\x{1F}\\x{7F}-\\x{9F}\\x{AD}\\x{61C}\\x{180E}\\x{200B}-\\x{200F}\\x{2028}-\\x{2029}\\x{202A}-\\x{202E}"
                    + "\\x{2060}-\\x{206F}\\x{FEFF}\\x{FFF9}-\\x{FFFB}\\x{E0000}-\\x{E007F}]");

    /** Прогон текста; null в color означает «цвет по умолчанию». */
    record Run(String text, String color, boolean bold, boolean italic, boolean underlined, boolean strikethrough,
               boolean obfuscated) {
        Run withText(String t) {
            return new Run(t, color, bold, italic, underlined, strikethrough, obfuscated);
        }
    }

    private LegacyText() {}

    /** Очистка одного фрагмента текста (после удаления §-кодов). */
    static String sanitize(String raw) {
        String clean = UNSAFE.matcher(Normalizer.normalize(raw, Normalizer.Form.NFC)).replaceAll("");
        // Одинокие суррогаты в UTF-8 превращались бы в «?»; убираем заранее.
        StringBuilder sb = new StringBuilder(clean.length());
        for (int i = 0; i < clean.length(); i++) {
            char c = clean.charAt(i);
            if (Character.isHighSurrogate(c) && i + 1 < clean.length() && Character.isLowSurrogate(clean.charAt(i + 1))) {
                sb.append(c).append(clean.charAt(++i));
            } else if (!Character.isSurrogate(c)) {
                sb.append(c);
            }
        }
        clean = sb.toString();
        int cps = clean.codePointCount(0, clean.length());
        return cps > MAX_RUN_CHARS ? clean.substring(0, clean.offsetByCodePoints(0, MAX_RUN_CHARS)) : clean;
    }

    static String colorName(char code) {
        return switch (Character.toLowerCase(code)) {
            case '0' -> "black";
            case '1' -> "dark_blue";
            case '2' -> "dark_green";
            case '3' -> "dark_aqua";
            case '4' -> "dark_red";
            case '5' -> "dark_purple";
            case '6' -> "gold";
            case '7' -> "gray";
            case '8' -> "dark_gray";
            case '9' -> "blue";
            case 'a' -> "green";
            case 'b' -> "aqua";
            case 'c' -> "red";
            case 'd' -> "light_purple";
            case 'e' -> "yellow";
            case 'f' -> "white";
            default -> null;
        };
    }

    /** Разбор строки с §-кодами; пустые после очистки прогоны отбрасываются. */
    static List<Run> parse(String input) {
        List<Run> out = new ArrayList<>();
        if (input == null || input.isEmpty()) return out;
        String color = null;
        boolean bold = false, italic = false, under = false, strike = false, obf = false;
        StringBuilder cur = new StringBuilder();
        int i = 0;
        while (i < input.length()) {
            char c = input.charAt(i);
            if (c == '\u00A7' && i + 1 < input.length()) {
                char code = Character.toLowerCase(input.charAt(i + 1));
                String hex = null;
                int consumed = 2;
                if (code == 'x' && i + 14 <= input.length()) {
                    StringBuilder h = new StringBuilder("#");
                    boolean ok = true;
                    for (int k = 0; k < 6; k++) {
                        int p = i + 2 + k * 2;
                        char ch = input.charAt(p + 1);
                        if (input.charAt(p) != '\u00A7' || Character.digit(ch, 16) < 0) {
                            ok = false;
                            break;
                        }
                        h.append(Character.toUpperCase(ch));
                    }
                    if (ok) {
                        hex = h.toString();
                        consumed = 14;
                    }
                }
                String named = colorName(code);
                boolean style = "lmnokr".indexOf(code) >= 0;
                if (hex != null || named != null || style) {
                    flush(out, cur, color, bold, italic, under, strike, obf);
                    if (hex != null) {
                        color = hex; bold = italic = under = strike = obf = false;
                    } else if (named != null) {
                        color = named; bold = italic = under = strike = obf = false;
                    } else {
                        switch (code) {
                            case 'l' -> bold = true;
                            case 'o' -> italic = true;
                            case 'n' -> under = true;
                            case 'm' -> strike = true;
                            case 'k' -> obf = true;
                            default -> { color = null; bold = italic = under = strike = obf = false; }
                        }
                    }
                    i += consumed;
                    continue;
                }
                i += 2; // неизвестный код: пропускаем «§» и символ
                continue;
            }
            if (c == '\u00A7') { // «§» в конце строки
                i++;
                continue;
            }
            cur.append(c);
            i++;
        }
        flush(out, cur, color, bold, italic, under, strike, obf);
        return out;
    }

    private static void flush(List<Run> out, StringBuilder cur, String color, boolean b, boolean it, boolean u, boolean s, boolean o) {
        if (cur.length() == 0) return;
        String text = sanitize(cur.toString());
        cur.setLength(0);
        if (!text.isEmpty()) {
            out.add(new Run(text, color == null ? null : color.toLowerCase(Locale.ROOT).startsWith("#") ? color.toUpperCase(Locale.ROOT) : color, b, it, u, s, o));
        }
    }

    static int chars(List<Run> runs) {
        int n = 0;
        for (Run r : runs) n += r.text().codePointCount(0, r.text().length());
        return n;
    }
}
