package ru.twomc.giveaway;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;

/**
 * Рабочие настройки отправки. Значения из config.yml могут быть переопределены переменными окружения
 * GIVEAWAY_API_URL, GIVEAWAY_SERVER_ID, GIVEAWAY_KEY_VERSION, GIVEAWAY_KEY_FILE.
 * Ключ читается из файла и нигде не печатается (toString скрывает его).
 */
public final class SenderConfig {
    public final URI endpoint;
    public final String serverId;
    public final int keyVersion;
    public final String keyId;
    private final byte[] key;

    private SenderConfig(URI endpoint, String serverId, int keyVersion, byte[] key) {
        this.endpoint = endpoint;
        this.serverId = serverId;
        this.keyVersion = keyVersion;
        this.keyId = Signer.formatKeyId(serverId, keyVersion);
        this.key = key;
    }

    /** Копия не нужна: массив не покидает пакет. */
    byte[] key() {
        return key;
    }

    /** Адрес другого подписываемого пути того же сайта (redeem, progress). */
    public URI endpointFor(String path) {
        return URI.create(endpoint.getScheme() + "://" + endpoint.getRawAuthority() + path);
    }

    /** Для тестов и подписи. */
    public static SenderConfig of(URI endpoint, String serverId, int keyVersion, byte[] key) {
        return new SenderConfig(endpoint, serverId, keyVersion, key);
    }

    @Override
    public String toString() {
        return "SenderConfig[endpoint=" + endpoint.getHost() + ", keyId=" + keyId + ", key=<hidden>]";
    }

    /** Результат разбора: либо конфигурация, либо одно понятное описание проблемы. */
    public record Result(SenderConfig config, String problem) {
        public boolean ok() {
            return config != null;
        }
    }

    public static Result resolve(String cfgApiUrl, String cfgServerId, int cfgKeyVersion, String cfgKeyFile,
                                 Map<String, String> env, Path dataFolder) {
        String apiUrl = pick(env.get("GIVEAWAY_API_URL"), cfgApiUrl);
        String serverId = pick(env.get("GIVEAWAY_SERVER_ID"), cfgServerId);
        String keyFile = pick(env.get("GIVEAWAY_KEY_FILE"), cfgKeyFile);
        String versionRaw = env.get("GIVEAWAY_KEY_VERSION");

        int version = cfgKeyVersion;
        if (versionRaw != null && !versionRaw.isBlank()) {
            try {
                version = Integer.parseInt(versionRaw.trim());
            } catch (NumberFormatException e) {
                return fail("GIVEAWAY_KEY_VERSION не является числом");
            }
        }

        if (apiUrl.isEmpty()) return fail("не задан apiUrl (config.yml или GIVEAWAY_API_URL)");
        if (serverId.isEmpty()) return fail("не задан serverId (config.yml или GIVEAWAY_SERVER_ID)");
        if (keyFile.isEmpty()) return fail("не задан keyFile (config.yml или GIVEAWAY_KEY_FILE)");
        if (!Protocol.SERVER_ID.matcher(serverId).matches()) {
            return fail("serverId должен соответствовать ^[a-z0-9][a-z0-9-]{1,31}$");
        }
        if (version < 1 || version > Protocol.MAX_KEY_VERSION) {
            return fail("keyVersion должен быть в диапазоне 1.." + Protocol.MAX_KEY_VERSION);
        }

        URI endpoint;
        try {
            endpoint = buildEndpoint(apiUrl);
        } catch (IllegalArgumentException e) {
            return fail(e.getMessage());
        }

        Path keyPath = Path.of(keyFile);
        if (!keyPath.isAbsolute()) keyPath = dataFolder.resolve(keyPath);
        byte[] key;
        try {
            String hex = Files.readString(keyPath, StandardCharsets.UTF_8).trim();
            if (!Protocol.KEY_HEX.matcher(hex).matches()) {
                return fail("файл ключа должен содержать 64 hex-символа");
            }
            key = HexFormat.of().parseHex(hex);
        } catch (IOException | RuntimeException e) {
            return fail("не удалось прочитать файл ключа (" + e.getClass().getSimpleName() + ")");
        }
        return new Result(new SenderConfig(endpoint, serverId, version, key), null);
    }

    /** База сайта + фиксированный путь. Полный адрес с этим же путём тоже допустим. */
    static URI buildEndpoint(String apiUrl) {
        URI base;
        try {
            base = new URI(apiUrl.trim());
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("apiUrl не является корректным адресом");
        }
        String scheme = base.getScheme() == null ? "" : base.getScheme().toLowerCase(Locale.ROOT);
        String host = base.getHost();
        if (host == null || (!scheme.equals("https") && !scheme.equals("http"))) {
            throw new IllegalArgumentException("apiUrl должен быть вида https://домен");
        }
        boolean local = host.equals("localhost") || host.equals("127.0.0.1") || host.equals("::1") || host.equals("[::1]");
        if (scheme.equals("http") && !local) {
            throw new IllegalArgumentException("http допустим только для localhost; используйте https");
        }
        if (base.getRawQuery() != null || base.getRawFragment() != null || base.getRawUserInfo() != null) {
            throw new IllegalArgumentException("apiUrl не должен содержать query, fragment или учётные данные");
        }
        String path = base.getRawPath() == null ? "" : base.getRawPath();
        while (path.endsWith("/")) path = path.substring(0, path.length() - 1);
        if (!path.isEmpty() && !path.equals(Protocol.SIGN_PATH)) {
            throw new IllegalArgumentException("apiUrl должен быть без пути (путь " + Protocol.SIGN_PATH + " добавляется сам)");
        }
        String authority = base.getRawAuthority();
        return URI.create(scheme + "://" + authority + Protocol.SIGN_PATH);
    }

    private static String pick(String env, String cfg) {
        if (env != null && !env.isBlank()) return env.trim();
        return cfg == null ? "" : cfg.trim();
    }

    private static Result fail(String problem) {
        return new Result(null, problem);
    }
}
