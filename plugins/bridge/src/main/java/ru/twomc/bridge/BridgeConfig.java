package ru.twomc.bridge;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Рабочие настройки выдачи. Значения из config.yml переопределяются переменными окружения
 * TWOMC_BRIDGE_URL, TWOMC_BRIDGE_KEY_ID, TWOMC_BRIDGE_KEY_FILE; секрет можно передать напрямую в
 * TWOMC_BRIDGE_KEY_HEX (приоритетнее файла). Секрет нигде не печатается (toString скрывает его).
 */
final class BridgeConfig {
    /** Значения «как в config.yml», до проверки. */
    record Raw(String siteUrl, String keyId, String keyFile, List<String> extraRoots, int maxPerClaim,
               int keyRetentionDays) {}

    /** Результат разбора: либо конфигурация, либо одно понятное описание проблемы (без значений секрета). */
    record Result(BridgeConfig config, String problem) {
        boolean ok() {
            return config != null;
        }
    }

    static final int MIN_RETENTION_DAYS = 60;

    final URI base;
    final String keyId;
    final CommandPolicy policy;
    final int maxPerClaim;
    final long keyRetentionMs;
    private final byte[] key;

    private BridgeConfig(URI base, String keyId, byte[] key, CommandPolicy policy, int maxPerClaim, long keyRetentionMs) {
        this.base = base;
        this.keyId = keyId;
        this.key = key;
        this.policy = policy;
        this.maxPerClaim = maxPerClaim;
        this.keyRetentionMs = keyRetentionMs;
    }

    byte[] key() {
        return key;
    }

    @Override
    public String toString() {
        return "BridgeConfig[site=" + base.getHost() + ", keyId=" + keyId + ", key=<hidden>]";
    }

    static Result resolve(Raw raw, Map<String, String> env, Path dataFolder) {
        String siteUrl = pick(env.get("TWOMC_BRIDGE_URL"), raw.siteUrl());
        String keyId = pick(env.get("TWOMC_BRIDGE_KEY_ID"), raw.keyId());
        String keyFile = pick(env.get("TWOMC_BRIDGE_KEY_FILE"), raw.keyFile());
        String keyHexEnv = env.get("TWOMC_BRIDGE_KEY_HEX") == null ? "" : env.get("TWOMC_BRIDGE_KEY_HEX").trim();

        if (siteUrl.isEmpty()) return fail("не задан siteUrl (config.yml или TWOMC_BRIDGE_URL)");
        if (keyId.isEmpty()) return fail("не задан keyId (config.yml или TWOMC_BRIDGE_KEY_ID)");
        if (!Protocol.KEY_ID.matcher(keyId).matches()) {
            return fail("keyId должен быть вида <slug>.<поколение>, например survival.1");
        }
        if (raw.maxPerClaim() < 1 || raw.maxPerClaim() > Protocol.CLAIM_MAX_LIMIT) {
            return fail("maxPerClaim должен быть в диапазоне 1.." + Protocol.CLAIM_MAX_LIMIT);
        }
        if (raw.keyRetentionDays() < MIN_RETENTION_DAYS) {
            return fail("keyRetentionDays не меньше " + MIN_RETENTION_DAYS);
        }

        URI base;
        try {
            base = buildBase(siteUrl);
        } catch (IllegalArgumentException e) {
            return fail(e.getMessage());
        }

        CommandPolicy policy;
        try {
            policy = CommandPolicy.of(raw.extraRoots());
        } catch (IllegalArgumentException e) {
            return fail(e.getMessage());
        }

        String hex = keyHexEnv;
        if (hex.isEmpty()) {
            if (keyFile.isEmpty()) {
                return fail("не задан секрет: TWOMC_BRIDGE_KEY_HEX или keyFile (config.yml, TWOMC_BRIDGE_KEY_FILE)");
            }
            Path keyPath = Path.of(keyFile);
            if (!keyPath.isAbsolute()) keyPath = dataFolder.resolve(keyPath);
            try {
                hex = Files.readString(keyPath, StandardCharsets.UTF_8).trim();
            } catch (IOException | RuntimeException e) {
                return fail("не удалось прочитать файл ключа (" + e.getClass().getSimpleName() + ")");
            }
        }
        if (!Protocol.KEY_HEX.matcher(hex).matches()) {
            return fail("секрет сервера должен быть 64 hex-символа"); // значение не печатаем
        }
        byte[] key = HexFormat.of().parseHex(hex);
        long retentionMs = raw.keyRetentionDays() * 24L * 60L * 60L * 1000L;
        return new Result(new BridgeConfig(base, keyId, key, policy, raw.maxPerClaim(), retentionMs), null);
    }

    /** База сайта без пути. http допустим только для localhost. */
    static URI buildBase(String siteUrl) {
        URI u;
        try {
            u = new URI(siteUrl.trim());
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("siteUrl не является корректным адресом");
        }
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        String host = u.getHost();
        if (host == null || (!scheme.equals("https") && !scheme.equals("http"))) {
            throw new IllegalArgumentException("siteUrl должен быть вида https://домен");
        }
        boolean local = host.equals("localhost") || host.equals("127.0.0.1") || host.equals("[::1]") || host.equals("::1");
        if (scheme.equals("http") && !local) {
            throw new IllegalArgumentException("http допустим только для localhost; для сайта нужен https");
        }
        if (u.getRawUserInfo() != null || u.getRawQuery() != null || u.getRawFragment() != null) {
            throw new IllegalArgumentException("siteUrl не должен содержать логин, query или fragment");
        }
        String path = u.getRawPath() == null ? "" : u.getRawPath();
        if (!path.isEmpty() && !path.equals("/")) {
            throw new IllegalArgumentException("siteUrl должен быть без пути (путь /bridge/v1/... плагин добавляет сам)");
        }
        return URI.create(scheme + "://" + u.getRawAuthority());
    }

    private static String pick(String env, String cfg) {
        if (env != null && !env.isBlank()) return env.trim();
        return cfg == null ? "" : cfg.trim();
    }

    private static Result fail(String problem) {
        return new Result(null, problem);
    }
}
