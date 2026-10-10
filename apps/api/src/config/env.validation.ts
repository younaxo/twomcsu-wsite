import * as Joi from 'joi';

/// Валидируются только переменные, которые реально читает существующий код
/// (ADR-0015) — расширяется вместе с кодом, использующим новую переменную,
/// а не заранее по полному списку из .env.example.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  API_PORT: Joi.number().port().default(4000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  WEB_ORIGIN: Joi.string().uri().default('http://localhost:3000'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES: Joi.string().default('30d'),
  BCRYPT_ROUNDS: Joi.number().integer().min(4).max(15).default(12),

  COOKIE_DOMAIN: Joi.string().default('localhost'),
  COOKIE_SECURE: Joi.boolean().default(false),
  COOKIE_SAMESITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),

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
      is: 'production',
      then: Joi.valid(false).messages({
        'any.only': 'AUTH_TEST_OTP_ENABLED запрещён в production',
      }),
    }),

  /// TURNSTILE_DISABLED — только для автотестов без сети (CI e2e).
  TURNSTILE_DISABLED: Joi.boolean().default(false),
  TURNSTILE_SECRET_KEY: Joi.string()
    .allow('')
    .when('TURNSTILE_DISABLED', { is: false, then: Joi.string().required() }),

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

  /// Без credentials реальный опрос Twitch/YouTube не выполняется (CRUD
  /// каналов и закэшированный в БД статус работают) — см. RISKS.md R6.
  TWITCH_CLIENT_ID: Joi.string().allow('').default(''),
  TWITCH_CLIENT_SECRET: Joi.string().allow('').default(''),
  YOUTUBE_API_KEY: Joi.string().allow('').default(''),

  /// Провайдер не выбран (RISKS.md R2, ADR-0009) — только 'test' реализован.
  /// PAYMENT_WEBHOOK_SECRET подписывает вебхук (HMAC-SHA256 от сырого тела).
  PAYMENT_PROVIDER: Joi.string().valid('test').default('test'),
  PAYMENT_API_KEY: Joi.string().allow('').default(''),
  PAYMENT_WEBHOOK_SECRET: Joi.string().allow('').default('test-webhook-secret'),
}).unknown(true);
