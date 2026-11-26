package ru.twomc.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import org.junit.jupiter.api.Test;

class CommandPolicyTest {
    private final CommandPolicy policy = CommandPolicy.of(List.of());

    @Test
    void defaultRootsAllowed() {
        assertNull(policy.check("lp user Steve parent addtemp vip 30d"));
        assertNull(policy.check("luckperms user Steve permission set a.b true"));
        assertNull(policy.check("give Steve diamond 3"));
        assertNull(policy.check("crate give Steve key 1"));
        assertNull(policy.check("cratekey give Steve vote 1"));
        assertNull(policy.check("eco give Steve 100"));
    }

    @Test
    void rootIsCaseInsensitive() {
        assertNull(policy.check("LP user Steve info"));
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
        assertEquals("command_invalid", policy.check("give Steve diamond stop"));
        assertEquals("command_invalid", policy.check("/give Steve diamond"));
        assertEquals("command_invalid", policy.check(" give Steve diamond"));
        assertEquals("command_invalid", policy.check("give Steve diamond "));
        assertEquals("command_invalid", policy.check("give Steve diamond;stop"));
        assertEquals("command_invalid", policy.check("give Steve diamond{x:1}"));
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
    }

    @Test
    void extraRootsValidated() {
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("op")));
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("bad root")));
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("a:b")));
        assertThrows(IllegalArgumentException.class, () -> CommandPolicy.of(List.of("")));
    }
}
