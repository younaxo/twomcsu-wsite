package ru.twomc.giveaway;

import java.time.Duration;
import java.util.regex.Pattern;

/** Константы контракта ADR-G001 (раздел «Контракт для плагина»). */
public final class Protocol {
    private Protocol() {}

    public static final String SCHEMA = "twomc.giveaway.v1";
    public static final String SIGNATURE_PREFIX = "twomc-giveaway-v1";
    /** Путь, который подписывается ВСЕГДА. */
    public static final String SIGN_PATH = "/api/giveaway/v1/events";
    public static final String METHOD = "POST";
    /** Фаза 2 (ADR-G002 п. 6): подписываемые пути redeem и progress. */
    public static final String REDEEM_PATH = "/api/giveaway/v1/redeem";
    public static final String PROGRESS_PATH = "/api/giveaway/v1/progress";
    public static final int MAX_PROGRESS_UUIDS = 100;
    /** Билет: буква без I и O плюс три цифры (ADR-G002 п. 7.1). */
    public static final Pattern TICKET = Pattern.compile("^[A-HJ-NP-Z][0-9]{3}$");

    public static final String HEADER_KEY_ID = "X-Giveaway-Key-Id";
    public static final String HEADER_TIMESTAMP = "X-Giveaway-Timestamp";
    public static final String HEADER_NONCE = "X-Giveaway-Nonce";
    public static final String HEADER_SIGNATURE = "X-Giveaway-Signature";

    public static final int MAX_EVENTS_PER_BATCH = 100;
    public static final int MAX_BODY_BYTES = 65_536;

    /** Сервер отвергает события старше 72 ч; берём запас, чтобы пакет успел дойти. */
    public static final Duration MAX_EVENT_AGE = Duration.ofHours(72);
    public static final Duration AGE_SAFETY_MARGIN = Duration.ofMinutes(5);

    public static final Pattern SERVER_ID = Pattern.compile("^[a-z0-9][a-z0-9-]{1,31}$");
    public static final Pattern PLAYER_NAME = Pattern.compile("^[A-Za-z0-9_]{1,16}$");
    public static final Pattern KEY_HEX = Pattern.compile("^[0-9a-fA-F]{64}$");
    public static final int MAX_KEY_VERSION = 999_999;
}
