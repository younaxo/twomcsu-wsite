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

  HCAPTCHA_DISABLED: Joi.boolean().default(false),
  HCAPTCHA_SECRET: Joi.string()
    .allow('')
    .when('HCAPTCHA_DISABLED', { is: false, then: Joi.string().required() }),

  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  SMTP_FROM_NAME: Joi.string().default('TwoMC'),
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
