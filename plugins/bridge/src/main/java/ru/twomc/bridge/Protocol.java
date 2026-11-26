package ru.twomc.bridge;

import java.util.List;
import java.util.regex.Pattern;

/** Константы контракта Bridge (docs/stage-03/BRIDGE-CONTRACT.md, разделы 2 и 14). */
final class Protocol {
    private Protocol() {}

    static final String SIGNATURE_PREFIX = "twomc-bridge-v1";
    static final String PROTOCOL_VERSION = "1";
    static final String METHOD = "POST";
    static final String PATH_CLAIM = "/bridge/v1/delivery/claim";
    static final String PATH_ACK = "/bridge/v1/delivery/ack";

    static final String HEADER_KEY_ID = "x-twomc-key-id";
    static final String HEADER_TIMESTAMP = "x-twomc-timestamp";
    static final String HEADER_NONCE = "x-twomc-nonce";
    static final String HEADER_PROTOCOL = "x-twomc-protocol";
    static final String HEADER_SIGNATURE = "x-twomc-signature";

    static final Pattern KEY_ID = Pattern.compile("^[a-z0-9][a-z0-9-]{1,31}\.[0-9]{1,6}$");
    static final Pattern KEY_HEX = Pattern.compile("^[0-9a-fA-F]{64}$");
    static final Pattern ROOT = Pattern.compile("^[a-z0-9_-]{1,32}$");

    /** Форматы значений из ответа сайта (bridge-delivery-schema.ts). */
    static final Pattern JOB_ID = Pattern.compile("^[A-Za-z0-9_-]{8,40}$");
    static final Pattern CLAIM_TOKEN = Pattern.compile("^[0-9a-fA-F-]{36}$");
    static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_.:-]{1,80}$");
    static final Pattern CODE = Pattern.compile("^[a-z0-9_]{1,48}$");

    static final int CLAIM_MAX_LIMIT = 10;
    static final int ACK_MAX_ITEMS = 20;

    /** Зеркало RENDERED_COMMAND_MAX_LENGTH и LITERAL_RE на сайте (command-template.ts). */
    static final int COMMAND_MAX_LENGTH = 256;
    static final Pattern COMMAND_LITERAL = Pattern.compile("^[A-Za-z0-9_ .:,+-]*$");

    static final List<String> DEFAULT_ROOTS = List.of("lp", "luckperms", "give", "crate", "cratekey", "eco");
    /** Зеркало FORBIDDEN_COMMAND_ROOTS сайта плюс несколько служебных: не разрешаются даже через extraRoots. */
    static final List<String> FORBIDDEN_ROOTS = List.of(
            "op", "deop", "stop", "restart", "reload", "rl", "whitelist", "ban", "ban-ip", "banip", "pardon", "pardon-ip", "kick", "execute", "sudo", "console", "plugman", "pl", "plugins", "minecraft:op", "save-all", "save-off", "save-on", "setworldspawn", "gamemode", "fill", "rcon", "bukkit:reload", "bukkit:stop", "minecraft:stop", "minecraft:execute");

    /** Коды ack (закрытый список плагина; все подходят под CODE). */
    static final String CODE_NOT_ALLOWED = "command_not_allowed";
    static final String CODE_INVALID = "command_invalid";
    static final String CODE_FORBIDDEN = "command_forbidden";
    static final String CODE_REJECTED = "command_rejected";
    static final String CODE_INVALID_JOB = "invalid_job";
    static final String CODE_STORE_UNAVAILABLE = "store_unavailable";
    static final String CODE_SHUTDOWN = "plugin_shutdown";
    static final String CODE_TOO_MANY = "too_many_jobs";
    static final String CODE_OUTCOME_UNKNOWN = "outcome_unknown";
    static final String CODE_DISPATCH_EXCEPTION = "dispatch_exception";
}
