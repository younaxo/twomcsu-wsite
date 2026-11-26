package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CommandPolicyTest {
    private final CommandPolicy policy = CommandPolicy.of(List.of());

    @Test
    void defaultFormsAllowed() {
        assertNull(policy.check("lp user Steve parent add vip"));
        assertNull(policy.check("lp user Steve parent addtemp vip 30d"));
        assertNull(policy.check("lp user Steve parent addtemp vip forever"));
        assertNull(policy.check("lp user Steve_1 parent add vip 7d"));
        assertNull(policy.check("luckperms user Steve parent add vip"));
        assertNull(policy.check("luckperms user Steve parent addtemp vip 90d"));
        assertNull(policy.check("give Steve diamond"));
        assertNull(policy.check("give Steve diamond 3"));
        assertNull(policy.check("give Steve minecraft:diamond 3"));
        assertNull(policy.check("crate key give Steve vote 1"));
        assertNull(policy.check("crate key give Steve vote"));
        assertNull(policy.check("cratekey key give Steve vote 2"));
        assertNull(policy.check("cratekey give Steve vote 1")); // форма из проверок рендера на сайте
        assertNull(policy.check("eco give Steve 100"));
        assertNull(policy.check("eco give Steve 12.5"));
    }

    @Test
    void defaultRootsMatchSiteDefaults() {
        assertEquals(Set.copyOf(Protocol.DEFAULT_ROOTS), policy.roots());
    }

    @Test
    void rootIsCaseInsensitive_andSubcommandsToo() {
        assertNull(policy.check("LP USER Steve PARENT ADD vip"));
    }

    @Test
    void allowedRootWithOtherShapeIsNotAllowed() {
        for (String c : new String[] {
                "lp user Steve permission set a.b true",
                "lp user Steve info",
                "lp user Steve parent set admin",
                "lp user Steve parent add",
                "lp user Steve parent addtemp",
                "lp user Steve parent add vip 30d extra",
                "lp user Steve parent add vip 30",
                "lp group admin permission set x.y true",
                "lp user St parent add vip", // ник короче 3
                "lp user all parent add vip", // зарезервированный ник
                "lp  user Steve parent add vip", // двойной пробел
                "luckperms user Steve permission set a.b true",
                "eco take Steve 5",
                "eco set Steve 5",
                "eco give Steve -5",
                "eco give Steve 1e9",
                "eco give Steve 1.234",
                "eco give Steve",
                "give Steve diamond 99999",
                "give Steve diamond 1 2",
                "give Steve",
                "crate give Steve vote 1",
                "crate key give Steve vote 1 2",
                "crate key take Steve vote 1",
                "cratekey key give St vote 1",
        }) {
            assertEquals("command_not_allowed", policy.check(c), c);
        }
    }

    @Test
    void unknownRootRejected() {
        assertEquals("command_not_allowed", policy.check("tp Steve 0 0 0"));
        assertEquals("command_not_allowed", policy.check("minecraft:give Steve diamond"));
        assertEquals("command_not_allowed", policy.check("lpx user Steve"));
    }

    @Test
    void forbiddenRootsRejectedWithOwnCode() {
        assertEquals("command_forbidden", policy.check("op Steve"));
        assertEquals("command_forbidden", policy.check("stop"));
        assertEquals("command_forbidden", policy.check("execute as Steve run say hi"));
    }

    @Test
    void injectionAndFormatRejected() {
        assertEquals("command_invalid", policy.check("give Steve diamond\nop Steve"));
        assertEquals("command_invalid", policy.check("give Steve diamond\rstop"));
        assertEquals("command_invalid", policy.check("give Steve diamond" + (char) 0x2028 + "stop"));
        assertEquals("command_invalid", policy.check("/give Steve diamond"));
        assertEquals("command_invalid", policy.check(" give Steve diamond"));
        assertEquals("command_invalid", policy.check("give Steve diamond "));
        assertEquals("command_invalid", policy.check("give Steve diamond;stop"));
        assertEquals("command_invalid", policy.check("give Steve diamond{x:1}"));
        assertEquals("command_invalid", policy.check("give @a diamond 1"));
        assertEquals("command_invalid", policy.check("lp user Steve parent add vip server=survival"));
        assertEquals("command_invalid", policy.check(""));
        assertEquals("command_invalid", policy.check(null));
        assertEquals("command_invalid", policy.check("give " + "a".repeat(300)));
    }

    @Test
    void extraRootsExtendWhitelist() {
        CommandPolicy p = CommandPolicy.of(List.of("Bank", " kits "));
        assertNull(p.check("bank add Steve 5"));
        assertNull(p.check("kits give Steve starter"));
        assertEquals("command_not_allowed", p.check("tp Steve"));
        assertEquals("command_not_allowed", p.check("lp user Steve info"), "шаблоны по умолчанию остаются узкими");
    }

    @Test
    void extraRootsValidated() {
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("op")));
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("bad root")));
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("a:b")));
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("")));
        // корень, уже ограниченный шаблонами по умолчанию, целиком не открывается
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("lp")));
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("give")));
    }

    @Test
    void extraTemplatesAddCheckedShapes() {
        CommandPolicy p = CommandPolicy.of(List.of(),
                List.of("kits give {nick} {key}", "Lp user {nick} parent remove {group}", "warp set {key} {int}?"));
        assertNull(p.check("kits give Steve starter"));
        assertEquals("command_not_allowed", p.check("kits take Steve starter"));
        assertEquals("command_not_allowed", p.check("kits give Steve starter extra"));
        assertNull(p.check("lp user Steve parent remove vip"));
        assertNull(p.check("lp user Steve parent add vip"), "шаблоны по умолчанию сохранены");
        assertEquals("command_not_allowed", p.check("lp user Steve parent clear"));
        assertNull(p.check("warp set spawn"));
        assertNull(p.check("warp set spawn 5"));
        assertTrue(p.roots().contains("kits"));
        assertTrue(p.roots().contains("warp"));
    }

    @Test
    void extraTemplatesValidated() {
        for (String bad : new String[] {
                "op give {nick}", // запрещённый корень
                "kits {bogus}", // неизвестный тип
                "kits {nick}? {key}", // обязательный после необязательного
                "kits give;{nick}", // недопустимое слово
                "kits  give {nick}", // двойной пробел
                "Bad:Root give {nick}", // недопустимый корень
                "kits a b c d e f g h i j k l m", // больше 12 аргументов
                "kits {nick",
                "kits {}",
                "",
                "   ",
        }) {
            assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of(), List.of(bad)), bad);
        }
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of(), java.util.Collections.singletonList(null)));
    }
}
