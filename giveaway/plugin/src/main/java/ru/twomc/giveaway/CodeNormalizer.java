package ru.twomc.giveaway;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Нормализация кода игрока, строго как на бэкенде (ADR-G002 п. 2.2, giveaway-codes.ts normalizeCode):
 * верхний регистр, удалить пробелы и дефисы, O -> 0, I и L -> 1, затем ^[0-9A-HJKMNP-TV-Z]{16}$.
 * Код не логируется и не попадает в сообщения об ошибках.
 */
public final class CodeNormalizer {
    private CodeNormalizer() {}

    private static final Pattern CODE = Pattern.compile("^[0-9A-HJKMNP-TV-Z]{16}$");
    private static final Pattern STRIP = Pattern.compile("[\\s-]");

    /** @return нормализованный код (16 символов) либо null. */
    public static String normalize(String input) {
        if (input == null || input.length() > 64) return null;
        String s = STRIP.matcher(input.toUpperCase(Locale.ROOT)).replaceAll("")
                .replace('O', '0').replace('I', '1').replace('L', '1');
        return CODE.matcher(s).matches() ? s : null;
    }
}
