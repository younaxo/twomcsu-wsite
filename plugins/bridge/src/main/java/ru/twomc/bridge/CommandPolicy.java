package ru.twomc.bridge;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Локальная проверка команды перед исполнением (контракт 14.2: плагин ОБЯЗАН повторно сверить команду
 * с собственным белым списком). Повторяет проверки сайта (validateRenderedCommand), чтобы подмена
 * строки в БД или в канале не дала выполнить иное, и СВЕРХ них проверяет форму подкоманды (M4, допущение Q112).
 *
 * <p>Белый список по умолчанию включён и задан шаблонами по корню команды ({@link Protocol#DEFAULT_TEMPLATES}):
 * {@code lp|luckperms user <ник> parent add|addtemp <группа> [срок]}, {@code eco give <ник> <число>},
 * {@code give <ник> <предмет> [кол-во]}, {@code crate|cratekey key give <ник> <ключ> [кол-во]}. Команда с разрешённым
 * корнем, но иной формой (например {@code lp user Steve permission set a.b true}) отклоняется кодом
 * {@code command_not_allowed}.
 *
 * <p>Расширение конфигом: {@code delivery.extraTemplates} (рекомендуется, форма проверяется) и
 * {@code delivery.extraRoots} (весь корень с любыми аргументами, шире и опаснее; только для корней, которых нет в
 * шаблонах по умолчанию). Синтаксис шаблона: слова через один пробел; первое слово корень; слово из литералов
 * {@code add|addtemp} (регистр не важен); {@code {тип}} один из {@code nick, group, key, duration, int, qty, num,
 * item}; суффикс {@code ?} делает завершающие аргументы необязательными. Запрещённые корни не разрешаются никак.
 */
final class CommandPolicy {
    /** Аргументы шаблона: допустимые значения по типам. Все шаблоны проходят только по этому закрытому списку. */
    private static final Map<String, Pattern> TYPES = Map.of(
            "nick", Pattern.compile("^[A-Za-z0-9_]{3,16}$"),
            "group", Pattern.compile("^[A-Za-z0-9_-]{1,32}$"),
            "key", Pattern.compile("^[A-Za-z0-9_-]{1,32}$"),
            "duration", Pattern.compile("^([0-9]{1,4}[smhdwyM]|forever|season|once)$"),
            "int", Pattern.compile("^[0-9]{1,6}$"),
            "qty", Pattern.compile("^[0-9]{1,4}$"),
            "num", Pattern.compile("^[0-9]{1,12}(\\.[0-9]{1,2})?$"),
            "item", Pattern.compile("^[A-Za-z0-9_.-]{1,64}(:[A-Za-z0-9_.-]{1,64})?$"));
    private static final Pattern LITERAL_ALT = Pattern.compile("^[A-Za-z0-9_.:-]{1,32}$");
    private static final int MAX_ARGS = 12;

    /** Один шаблон: проверки аргументов по позициям и число обязательных. */
    private record Rule(List<Predicate<String>> args, int required) {
        boolean matches(String[] actual, int from) {
            int n = actual.length - from;
            if (n < required || n > args.size()) {
                return false;
            }
            for (int i = 0; i < n; i++) {
                if (!args.get(i).test(actual[from + i])) {
                    return false;
                }
            }
            return true;
        }
    }

    private record Parsed(String root, Rule rule) {}

    private final Set<String> openRoots;
    private final Map<String, List<Rule>> rules;
    private final Set<String> allRoots;

    private CommandPolicy(Set<String> openRoots, Map<String, List<Rule>> rules) {
        this.openRoots = openRoots;
        this.rules = rules;
        Set<String> all = new LinkedHashSet<>(rules.keySet());
        all.addAll(openRoots);
        this.allRoots = Set.copyOf(all);
    }

    /** Шаблоны по умолчанию плюс расширение корнями из конфига. */
    static CommandPolicy of(Collection<String> extraRoots) {
        return of(extraRoots, null);
    }

    /**
     * Шаблоны по умолчанию плюс расширение: extraRoots (корень целиком) и extraTemplates (проверяемая форма).
     * Неверные или запрещённые корни и шаблоны дают IllegalArgumentException.
     */
    static CommandPolicy of(Collection<String> extraRoots, Collection<String> extraTemplates) {
        Map<String, List<Rule>> rules = new LinkedHashMap<>();
        for (String spec : Protocol.DEFAULT_TEMPLATES) {
            addRule(rules, parse(spec));
        }
        if (extraTemplates != null) {
            for (String spec : extraTemplates) {
                addRule(rules, parse(spec));
            }
        }
        Set<String> open = new LinkedHashSet<>();
        if (extraRoots != null) {
            for (String raw : extraRoots) {
                String r = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
                if (!Protocol.ROOT.matcher(r).matches()) {
                    throw new IllegalArgumentException("extraRoots: недопустимый корень (нужно ^[a-z0-9_-]{1,32}$)");
                }
                if (Protocol.FORBIDDEN_ROOTS.contains(r)) {
                    throw new IllegalArgumentException("extraRoots: корень «" + r + "» запрещён всегда");
                }
                if (rules.containsKey(r)) {
                    throw new IllegalArgumentException("extraRoots: корень «" + r + "» уже ограничен шаблонами; "
                            + "расширяйте его через extraTemplates");
                }
                open.add(r);
            }
        }
        return new CommandPolicy(Set.copyOf(open), rules);
    }

    private static void addRule(Map<String, List<Rule>> rules, Parsed p) {
        rules.computeIfAbsent(p.root(), k -> new ArrayList<>()).add(p.rule());
    }

    private static Parsed parse(String spec) {
        if (spec == null || spec.isBlank()) {
            throw new IllegalArgumentException("extraTemplates: пустой шаблон");
        }
        String[] parts = spec.trim().split(" ", -1);
        String root = parts[0].toLowerCase(Locale.ROOT);
        if (!Protocol.ROOT.matcher(root).matches()) {
            throw new IllegalArgumentException("шаблон «" + spec + "»: недопустимый корень (нужно ^[a-z0-9_-]{1,32}$)");
        }
        if (Protocol.FORBIDDEN_ROOTS.contains(root)) {
            throw new IllegalArgumentException("шаблон «" + spec + "»: корень «" + root + "» запрещён всегда");
        }
        if (parts.length - 1 > MAX_ARGS) {
            throw new IllegalArgumentException("шаблон «" + spec + "»: больше " + MAX_ARGS + " аргументов");
        }
        List<Predicate<String>> args = new ArrayList<>();
        int required = parts.length - 1;
        boolean optional = false;
        for (int i = 1; i < parts.length; i++) {
            String p = parts[i];
            boolean opt = p.endsWith("?");
            if (opt) {
                p = p.substring(0, p.length() - 1);
            }
            if (opt && !optional) {
                optional = true;
                required = i - 1;
            } else if (!opt && optional) {
                throw new IllegalArgumentException("шаблон «" + spec + "»: обязательный аргумент после необязательного");
            }
            args.add(token(spec, p));
        }
        return new Parsed(root, new Rule(List.copyOf(args), required));
    }

    private static Predicate<String> token(String spec, String p) {
        if (p.startsWith("{") && p.endsWith("}") && p.length() > 2) {
            String type = p.substring(1, p.length() - 1);
            Pattern pat = TYPES.get(type);
            if (pat == null) {
                throw new IllegalArgumentException("шаблон «" + spec + "»: неизвестный тип {" + type + "}");
            }
            if (type.equals("nick")) {
                return s -> pat.matcher(s).matches() && !s.equalsIgnoreCase("all"); // как RESERVED_NICKS на сайте
            }
            return s -> pat.matcher(s).matches();
        }
        Set<String> alts = new LinkedHashSet<>();
        for (String alt : p.split("\\|", -1)) {
            if (!LITERAL_ALT.matcher(alt).matches()) {
                throw new IllegalArgumentException("шаблон «" + spec + "»: недопустимое слово «" + alt + "»");
            }
            alts.add(alt.toLowerCase(Locale.ROOT));
        }
        return s -> alts.contains(s.toLowerCase(Locale.ROOT));
    }

    /** Все разрешённые корни (по шаблонам и целиком). */
    Set<String> roots() {
        return allRoots;
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
        String[] words = command.split(" ", -1); // двойной пробел даёт пустое слово, оно не подойдёт ни одному шаблону
        String root = words[0].toLowerCase(Locale.ROOT);
        if (Protocol.FORBIDDEN_ROOTS.contains(root)) {
            return Protocol.CODE_FORBIDDEN;
        }
        if (openRoots.contains(root)) {
            return null; // extraRoots: корень целиком, форма не проверяется
        }
        List<Rule> forRoot = rules.get(root);
        if (forRoot != null) {
            for (Rule r : forRoot) {
                if (r.matches(words, 1)) {
                    return null;
                }
            }
        }
        return Protocol.CODE_NOT_ALLOWED;
    }
}
