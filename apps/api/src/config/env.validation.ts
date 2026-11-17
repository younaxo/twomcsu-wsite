import * as Joi from 'joi';
import { isStrongMasterSecret } from '../modules/bridge/bridge.constants';
import { RELAXED_NODE_ENVS } from './node-env';
import { resolveTrustProxy } from './trust-proxy';

/// Валидируются только переменные, которые реально читает существующий код
/// (ADR-0015) — расширяется вместе с кодом, использующим новую переменную,
/// а не заранее по полному списку из .env.example.
/// Условие «окружение явно development или test»; `.required()` нужен, чтобы
/// отсутствующий NODE_ENV НЕ подпадал под ослабление (Joi по умолчанию
/// пропускает undefined в `is`).
const NON_PRODUCTION_ENV = Joi.valid(...RELAXED_NODE_ENVS).required();

export const envValidationSchema = Joi.object({
  /// Fail-closed (ADR-0164): пустой/не заданный NODE_ENV = production, дефолта
  /// `development` нет. Ослабление — только при явных development/test.
  NODE_ENV: Joi.string().allow('').valid('development', 'test', 'production'),
  API_PORT: Joi.number().port().default(4000),
  /// Политика доверия к прокси (ADR-0155): пусто — выключено; число hop-ов
  /// (1 для nginx → api); loopback/linklocal/uniquelocal; список CIDR.
  /// `true`, `*`, `-1` и мусор не запускают API.
  TRUST_PROXY: Joi.string()
    .allow('')
    .default('')
    .custom((value: string, helpers) => {
      try {
        resolveTrustProxy(value);
        return value;
      } catch (error) {
        return helpers.error('trustproxy.format', {
          message: (error as Error).message,
        });
      }
    })
    .messages({ 'trustproxy.format': '{{#message}}' })
    /// В production без TRUST_PROXY rate limit и audit видят IP nginx, а не
    /// клиента, поэтому значение обязательно и непустое.
    .when('NODE_ENV', {
      is: NON_PRODUCTION_ENV,
      otherwise: Joi.string().invalid('').required().messages({
        'any.required':
          'TRUST_PROXY обязателен в production (число доверенных прокси-хопов, например 1)',
        'any.invalid':
          'TRUST_PROXY обязателен в production (число доверенных прокси-хопов, например 1)',
        'string.empty':
          'TRUST_PROXY обязателен в production (число доверенных прокси-хопов, например 1)',
      }),
    }),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  WEB_ORIGIN: Joi.string().uri().default('http://localhost:3000'),
  /// Явный CORS allowlist через запятую (ADR-0104); пусто — только WEB_ORIGIN.
  WEB_ORIGINS: Joi.string().allow('').optional(),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES: Joi.string().default('30d'),
  BCRYPT_ROUNDS: Joi.number().integer().min(4).max(15).default(12),

  /// Cookie (ADR-0156). В production COOKIE_SECURE=true и COOKIE_DOMAIN
  /// (не localhost/127.0.0.1/пусто) обязательны; SameSite=none — только при
  /// COOKIE_SECURE=true в любом окружении. dev/test сохраняют дефолты.
  COOKIE_DOMAIN: Joi.string()
    .allow('')
    .default('localhost')
    .when('NODE_ENV', {
      is: NON_PRODUCTION_ENV,
      otherwise: Joi.string()
        .invalid('')
        .required()
        .custom((value: string, helpers) => {
          const host = value.trim().toLowerCase().replace(/^\./, '');
          if (
            host === '' ||
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '::1' ||
            host === '0.0.0.0' ||
            host.endsWith('.localhost')
          ) {
            return helpers.error('any.invalid');
          }
          return value;
        })
        .messages({
          'any.required': 'COOKIE_DOMAIN обязателен в production',
          'string.empty': 'COOKIE_DOMAIN обязателен в production',
          'any.invalid': 'COOKIE_DOMAIN не может быть localhost в production',
        }),
    }),
  COOKIE_SECURE: Joi.boolean()
    .default(false)
    .when('NODE_ENV', {
      is: NON_PRODUCTION_ENV,
      otherwise: Joi.boolean().required().valid(true).messages({
        'any.required': 'COOKIE_SECURE=true обязателен в production',
        'any.only': 'COOKIE_SECURE=true обязателен в production',
      }),
    }),
  COOKIE_SAMESITE: Joi.string()
    .valid('lax', 'strict', 'none')
    .default('lax')
    .when('COOKIE_SECURE', {
      is: Joi.boolean().valid(true).required(),
      otherwise: Joi.string().invalid('none').messages({
        'any.invalid':
          'COOKIE_SAMESITE=none допустим только при COOKIE_SECURE=true',
        'any.only':
          'COOKIE_SAMESITE=none допустим только при COOKIE_SECURE=true',
      }),
    }),

  /// Файловое хранилище (PHASE 23, ADR-0008).
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  CDN_BASE_URL: Joi.string().uri().default('http://localhost:4000/uploads'),
  UPLOADS_DIR: Joi.string().default('./uploads'),
  STORAGE_BUCKET: Joi.string()
    .allow('')
    .when('STORAGE_DRIVER', { is: 's3', then: Joi.string().required() }),
  STORAGE_ENDPOINT: Joi.string().uri().allow('').optional(),
  STORAGE_REGION: Joi.string().allow('').optional(),
  STORAGE_ACCESS_KEY: Joi.string()
    .allow('')
    .when('STORAGE_DRIVER', { is: 's3', then: Joi.string().required() }),
  STORAGE_SECRET_KEY: Joi.string()
    .allow('')
    .when('STORAGE_DRIVER', { is: 's3', then: Joi.string().required() }),
  /// Срок хранения audit log в днях (PHASE 22); очистка — ежедневно в 04:00.
  AUDIT_RETENTION_DAYS: Joi.number().integer().min(1).max(3650).default(90),

  /// Cloudflare Turnstile: secret обязателен, если проверка не отключена.
  /// Тестовый OTP регистрации (ADR-0087): 123456 — принят, 000000 — отказ.
  /// Только development/test; в production значение `true` не даёт запустить
  /// API (ошибка валидации env), по умолчанию — выключено.
  AUTH_TEST_OTP_ENABLED: Joi.boolean()
    .default(false)
    .when('NODE_ENV', {
      is: NON_PRODUCTION_ENV,
      otherwise: Joi.valid(false).messages({
        'any.only': 'AUTH_TEST_OTP_ENABLED запрещён в production',
      }),
    }),

  /// TURNSTILE_DISABLED — только для автотестов без сети (CI e2e).
  /// В production запрещён (fail-closed): captcha не отключается, секрет
  /// TURNSTILE_SECRET_KEY обязателен и непустой.
  TURNSTILE_DISABLED: Joi.boolean()
    .default(false)
    .when('NODE_ENV', {
      is: NON_PRODUCTION_ENV,
      otherwise: Joi.valid(false).messages({
        'any.only': 'TURNSTILE_DISABLED запрещён в production',
      }),
    }),
  TURNSTILE_SECRET_KEY: Joi.string()
    .allow('')
    .when('NODE_ENV', {
      is: NON_PRODUCTION_ENV,
      then: Joi.when('TURNSTILE_DISABLED', {
        is: false,
        then: Joi.string().required(),
      }),
      otherwise: Joi.string().invalid('').required().messages({
        'any.required': 'TURNSTILE_SECRET_KEY обязателен в production',
        'any.invalid': 'TURNSTILE_SECRET_KEY обязателен в production',
        'string.empty': 'TURNSTILE_SECRET_KEY обязателен в production',
      }),
    }),

  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  SMTP_FROM_NAME: Joi.string().default('twomc.su'),
  /// Полный адрес отправителя «Имя <email>»; приоритетнее SMTP_FROM_*.
  MAIL_FROM: Joi.string().allow('').optional(),

  /// Вход через Discord/Telegram (ADR-0069). Пусто — провайдер выключен.
  DISCORD_CLIENT_ID: Joi.string().allow('').optional(),
  DISCORD_CLIENT_SECRET: Joi.string().allow('').optional(),
  DISCORD_REDIRECT_URI: Joi.string()
    .uri()
    .default('http://localhost:4000/auth/discord/callback'),
  TELEGRAM_BOT_USERNAME: Joi.string().allow('').optional(),
  TELEGRAM_BOT_TOKEN: Joi.string().allow('').optional(),
  /// Telegram Login через OpenID Connect (ADR-0071): Client ID/Secret из
  /// BotFather → Login Widget; redirect URI — в Allowed URLs бота.
  TELEGRAM_CLIENT_ID: Joi.string().allow('').optional(),
  TELEGRAM_CLIENT_SECRET: Joi.string().allow('').optional(),
  /// Minecraft-плагин (ADR-0072): общий секрет подписи HMAC запросов
  /// `/minecraft/plugin/*`. Пусто — интеграция выключена, шаг Minecraft в
  /// регистрации не требуется.
  MINECRAFT_PLUGIN_SECRET: Joi.string().allow('').min(32).optional(),
  TELEGRAM_REDIRECT_URI: Joi.string()
    .uri()
    .default('http://localhost:4000/auth/telegram/callback'),
  STATUS_PAGE_URL: Joi.string().uri().default('https://status.twomc.su'),
  /// Версия юридических документов, фиксируемая в согласиях (ADR-0070).
  LEGAL_DOCS_VERSION: Joi.string().default('draft'),
  SMTP_FROM_EMAIL: Joi.string()
    .email({ tlds: false })
    .default('noreply@twomc.su'),

  /// Без обеих VAPID-переменных push-рассылка выключается (как SMTP выше) —
  /// см. RISKS.md R7. Явно не required — внешний блокер, не ошибка конфигурации.
  VAPID_PUBLIC_KEY: Joi.string().allow('').default(''),
  VAPID_PRIVATE_KEY: Joi.string().allow('').default(''),
  VAPID_SUBJECT: Joi.string().default('mailto:admin@twomc.su'),

  /// Ключ шифрования секретов 2FA (ADR-0109): строка ≥ 32 символов
  /// (`openssl rand -base64 32`). В production обязателен (ADR-0156): без него
  /// API не стартует, 2FA админов не отключается молча. Вне production пусто —
  /// 2FA недоступна, требование 2FA персонала не применяется. Смена ключа делает уже
  /// включённую 2FA нерабочей — только вместе со сбросом 2FA.
  TWO_FACTOR_ENCRYPTION_KEY: Joi.string()
    .trim()
    .min(32)
    .messages({
      'any.required': 'TWO_FACTOR_ENCRYPTION_KEY обязателен в production',
      'string.empty': 'TWO_FACTOR_ENCRYPTION_KEY обязателен в production',
      'string.min':
        'TWO_FACTOR_ENCRYPTION_KEY в production — не короче 32 символов',
    })
    .when('NODE_ENV', {
      is: NON_PRODUCTION_ENV,
      then: Joi.string().allow('').default(''),
      otherwise: Joi.required(),
    }),

  /// Без credentials реальный опрос Twitch/YouTube не выполняется (CRUD
  /// каналов и закэшированный в БД статус работают) — см. RISKS.md R6.
  TWITCH_CLIENT_ID: Joi.string().allow('').default(''),
  TWITCH_CLIENT_SECRET: Joi.string().allow('').default(''),
  YOUTUBE_API_KEY: Joi.string().allow('').default(''),

  /// Провайдер не выбран (RISKS.md R2, ADR-0009) — только 'test' реализован.
  /// PAYMENT_WEBHOOK_SECRET — ключ HMAC-SHA256 подписи вебхука (ADR-0157),
  /// без дефолта: пустой секрет = все вебхуки отклоняются (401).
  PAYMENT_PROVIDER: Joi.string().valid('test').default('test'),
  PAYMENT_API_KEY: Joi.string().allow('').default(''),
  PAYMENT_WEBHOOK_SECRET: Joi.string().allow('').default(''),

  /// Интеграция наказаний LiteBans (этап 02, ADR-0166, раздел 2.3 дизайна).
  /// Все переменные необязательны и без дефолтов с секретами: без них модуль
  /// бездействует (статус «не настроено»), production не падает. Пароль задаёт
  /// владелец в хранилище секретов; значения в репозиторий не попадают.
  LITEBANS_ENABLED: Joi.boolean().default(false),
  LITEBANS_DB_DRIVER: Joi.string().valid('mysql').optional(),
  LITEBANS_DB_HOST: Joi.string().allow('').optional(),
  LITEBANS_DB_PORT: Joi.number().port().optional(),
  LITEBANS_DB_NAME: Joi.string().allow('').optional(),
  LITEBANS_DB_USER: Joi.string().allow('').optional(),
  LITEBANS_DB_PASSWORD: Joi.string().allow('').optional(),
  /// `required` = проверка сертификата и имени хоста. В production `disabled`
  /// отвергается (по образцу ADR-0164); пусто допустимо, пока интеграция
  /// выключена.
  LITEBANS_DB_SSL: Joi.string().when('NODE_ENV', {
    is: NON_PRODUCTION_ENV,
    then: Joi.string().valid('required', 'disabled', ''),
    otherwise: Joi.string().valid('required', '').messages({
      'any.only': 'LITEBANS_DB_SSL=disabled запрещён в production',
    }),
  }),
  /// В production при включённой интеграции без CA-файла старт отклоняется.
  LITEBANS_DB_SSL_CA_FILE: Joi.string()
    .allow('')
    .when('NODE_ENV', {
      is: NON_PRODUCTION_ENV,
      otherwise: Joi.when('LITEBANS_ENABLED', {
        is: true,
        then: Joi.string().invalid('').required().messages({
          'any.required':
            'LITEBANS_DB_SSL_CA_FILE обязателен в production при LITEBANS_ENABLED=true',
          'any.invalid':
            'LITEBANS_DB_SSL_CA_FILE обязателен в production при LITEBANS_ENABLED=true',
          'string.empty':
            'LITEBANS_DB_SSL_CA_FILE обязателен в production при LITEBANS_ENABLED=true',
        }),
      }),
    }),
  LITEBANS_TABLE_PREFIX: Joi.string()
    .pattern(/^[A-Za-z0-9_]{1,32}$/)
    .optional(),
  LITEBANS_POLL_INTERVAL_MS: Joi.number().integer().min(500).max(10_000),
  LITEBANS_BATCH_SIZE: Joi.number().integer().min(10).max(1000),
  LITEBANS_ACTIVE_CHECK_INTERVAL_S: Joi.number().integer().min(5).max(3600),
  LITEBANS_RECONCILE_INTERVAL_MIN: Joi.number().integer().min(5).max(1440),
  LITEBANS_DB_CONNECT_TIMEOUT_MS: Joi.number().integer().min(500).max(60_000),
  LITEBANS_DB_QUERY_TIMEOUT_MS: Joi.number().integer().min(500).max(60_000),

  /// Приёмник Bridge (этап 03, ADR-0182). Без `BRIDGE_ENABLED=true` и
  /// `BRIDGE_MASTER_SECRET` все пути `/bridge/v1/*` отвечают 503 (fail-closed).
  /// Секрет не короче 32 байт (UTF-8); задаёт только владелец, значение в
  /// репозиторий и логи не попадает. Флаг общий с разделом инвентаря (ADR-0168):
  /// секрет НЕ обязателен при включённом флаге, чтобы не ронять запуск.
  BRIDGE_ENABLED: Joi.boolean().default(false),
  BRIDGE_MASTER_SECRET: Joi.string()
    .allow('')
    .custom((value: string, helpers) =>
      value === '' || isStrongMasterSecret(Buffer.from(value, 'utf8'))
        ? value
        : helpers.error('string.min'),
    )
    .messages({
      'string.min':
        'BRIDGE_MASTER_SECRET: не короче 32 байт и не менее 16 различных байт',
    })
    .optional(),
  BRIDGE_TIMESTAMP_WINDOW_S: Joi.number().integer().min(5).max(300),
  BRIDGE_MAX_BODY_BYTES: Joi.number().integer().min(1024).max(1_048_576),
  BRIDGE_KEY_OVERLAP_DAYS: Joi.number().integer().min(1).max(30),
  BRIDGE_APPLY_LATENCY_LIMIT_MS: Joi.number().integer().min(100).max(30_000),
  /// Хранение журнала дедупликации: не меньше 7 суток (F5), иначе старт отклоняется.
  BRIDGE_LOG_RETENTION_DAYS: Joi.number().integer().min(7).max(365),
  BRIDGE_LOG_CLEANUP_ENABLED: Joi.boolean(),
}).unknown(true);
