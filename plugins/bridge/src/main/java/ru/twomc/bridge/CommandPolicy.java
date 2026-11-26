package ru.twomc.bridge;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Локальная проверка команды перед исполнением (контракт 14.2: плагин ОБЯЗАН повторно сверить корень
 * с собственным белым списком). Повторяет проверки сайта (validateRenderedCommand), чтобы подмена
 * строки в БД или в канале не дала выполнить иное.
 */
final class CommandPolicy {
    private final Set<String> roots;

    private CommandPolicy(Set<String> roots) {
        this.roots = roots;
    }

    /** Корни по умолчанию плюс расширение из конфига; неверные или запрещённые корни дают IllegalArgumentException. */
    static CommandPolicy of(Collection<String> extraRoots) {
        Set<String> all = new LinkedHashSet<>(Protocol.DEFAULT_ROOTS);
        if (extraRoots != null) {
            for (String raw : extraRoots) {
                String r = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
                if (!Protocol.ROOT.matcher(r).matches()) {
                    throw new IllegalArgumentException("extraRoots: недопустимый корень (нужно ^[a-z0-9_-]{1,32}$)");
                }
                if (Protocol.FORBIDDEN_ROOTS.contains(r)) {
                    throw new IllegalArgumentException("extraRoots: корень «" + r + "» запрещён всегда");
                }
                all.add(r);
            }
        }
        return new CommandPolicy(Set.copyOf(all));
    }

    Set<String> roots() {
        return roots;
    }

    /** null, если команду можно исполнить; иначе код для ack {@code failed}. */
    String check(String command) {
        if (command == null || command.isEmpty() || command.length() > Protocol.COMMAND_MAX_LENGTH) {
            return Protocol.CODE_INVALID;
        }
        for (int i = 0; i < command.length(); i++) {
            char c = command.charAt(i);
            if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c == 0x2028 || c == 0x2029) {
                return Protocol.CODE_INVALID; // перевод строки превратил бы одну команду в несколько
            }
        }
        if (!command.equals(command.trim()) || command.startsWith("/")) {
            return Protocol.CODE_INVALID;
        }
        if (!Protocol.COMMAND_LITERAL.matcher(command).matches()) {
            return Protocol.CODE_INVALID;
        }
        String root = command.split(" ", 2)[0].toLowerCase(Locale.ROOT);
        if (Protocol.FORBIDDEN_ROOTS.contains(root)) {
            return Protocol.CODE_FORBIDDEN;
        }
        return roots.contains(root) ? null : Protocol.CODE_NOT_ALLOWED;
    }
}
