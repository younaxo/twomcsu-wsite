import * as Joi from 'joi';
import { isStrongMasterSecret } from '../modules/bridge/bridge.constants';
import { PAYMENT_METHODS_PATTERN } from '../modules/store/payment/payment-methods';
import { RELAXED_NODE_ENVS } from './node-env';
import { resolveTrustProxy } from './trust-proxy';

/// Валидируются только переменные, которые реально читает существующий код
/// (ADR-0015) — расширяется вместе с кодом, использующим новую переменную,
/// а не заранее по полному списку из .env.example.
/// Условие «окружение явно development или test»; `.required()` нужен, чтобы
/// отсутствующий NODE_ENV НЕ подпадал под ослабление (Joi по умолчанию
/// пропускает undefined в `is`).
const NON_PRODUCTION_ENV = Joi.valid(...RELAXED_NODE_ENVS).required();

const envBaseKeys: Joi.PartialSchemaMap = {
  /// Fail-closed (ADR-0164): пустой/не заданный NODE_ENV = production, дефолта
  /// `development` нет. Ослабление — только при явных development/test.
  NODE_ENV: Joi.string().allow('').valid('development', 'test', 'production'),
  /// Режим только розыгрыша (мини-выкладка giveaway/deploy): подключаются лишь
  /// модули приёмника; auth/JWT/2FA/captcha/cookie не требуются.
  GIVEAWAY_ONLY: Joi.boolean().default(false),
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

  /// Провайдер не выбран (RISKS.md R2, ADR-0009). ADR-0187: 'test' и
  /// 'mock-http' допустимы только при явных development/test; в production
  /// (в т. ч. пустой/незаданный NODE_ENV) допустимо лишь пустое значение —
  /// оформление отвечает 503 payment_unavailable (fail closed); значение
  /// реального провайдера добавится в 0.8b.
  PAYMENT_PROVIDER: Joi.when('NODE_ENV', {
    is: NON_PRODUCTION_ENV,
    then: Joi.string().valid('test', 'mock-http').default('test'),
    otherwise: Joi.string().valid('').default('').messages({
      'any.only':
        'PAYMENT_PROVIDER в production пока допускает только пустое значение (0.8b)',
    }),
  }),
  /// Маршрутизатор способов оплаты (0.8b, ADR-0193): `SBP:mock-ru,CRYPTO:mock-crypto`.
  /// Пусто — способов нет (устаревший путь PAYMENT_PROVIDER). В production —
  /// только пусто, пока нет реальных адаптеров (fail closed).
  PAYMENT_METHODS: Joi.when('NODE_ENV', {
    is: NON_PRODUCTION_ENV,
    then: Joi.string().pattern(PAYMENT_METHODS_PATTERN).allow('').default(''),
    otherwise: Joi.string().valid('').default('').messages({
      'any.only':
        'PAYMENT_METHODS в production пока допускает только пустое значение (0.8b)',
    }),
  }),
  PAYMENT_API_KEY: Joi.string().allow('').default(''),
  /// PAYMENT_WEBHOOK_SECRET — ключ HMAC-SHA256 подписи вебхука (ADR-0157),
  /// без дефолта: пустой секрет = все вебхуки отклоняются (401). Непустой не
  /// короче 32 символов (ADR-0187). PAYMENT_WEBHOOK_SECRET_PREVIOUS — прежний
  /// секрет на время ротации (принимаются подписи обоих).
  PAYMENT_WEBHOOK_SECRET: Joi.string().min(32).allow('').default(''),
  PAYMENT_WEBHOOK_SECRET_PREVIOUS: Joi.string().min(32).allow('').default(''),
  /// Только dev/test (адаптер mock-http): адрес мок-сервера на loopback,
  /// таймаут запроса, число повторов и пауза между ними (ADR-0187).
  PAYMENT_MOCK_BASE_URL: Joi.string().allow('').default(''),
  PAYMENT_HTTP_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(30000)
    .default(5000),
  PAYMENT_HTTP_RETRIES: Joi.number().integer().min(0).max(5).default(2),
  PAYMENT_HTTP_RETRY_DELAY_MS: Joi.number()
    .integer()
    .min(0)
    .max(5000)
    .default(200),

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
  /// Дедлайн чтения тела запроса /bridge/v1 (по умолчанию 10000 мс).
  BRIDGE_BODY_READ_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(30_000)
    .default(10_000),
  /// Хранение журнала дедупликации: не меньше 7 суток (F5), иначе старт отклоняется.
  BRIDGE_LOG_RETENTION_DAYS: Joi.number().integer().min(7).max(365),
  BRIDGE_LOG_CLEANUP_ENABLED: Joi.boolean(),

  /// Розыгрыш «Анархия Новой Эры», фаза 1 (giveaway/docs/ADR-G001). Без
  /// GIVEAWAY_ENABLED=true и GIVEAWAY_MASTER_SECRET приёмник отвечает 503.
  /// Секрет не короче 32 байт; задаёт только владелец.
  GIVEAWAY_ENABLED: Joi.boolean().default(false),
  GIVEAWAY_MASTER_SECRET: Joi.string()
    .allow('')
    .custom((value: string, helpers) =>
      value === '' || isStrongMasterSecret(Buffer.from(value, 'utf8'))
        ? value
        : helpers.error('string.min'),
    )
    .messages({
      'string.min':
        'GIVEAWAY_MASTER_SECRET: не короче 32 байт и не менее 16 различных байт',
    })
    .optional(),
  GIVEAWAY_KEY_VERSION: Joi.number().integer().min(1).max(999_999),
  GIVEAWAY_ACCEPT_PREVIOUS_KEY: Joi.boolean(),
  GIVEAWAY_TIMESTAMP_WINDOW_S: Joi.number().integer().min(5).max(300),
  GIVEAWAY_THRESHOLD_MINUTES: Joi.number().integer().min(1).max(1_000_000),
  GIVEAWAY_START_AT: Joi.string().isoDate().allow(''),
  GIVEAWAY_CUTOFF_AT: Joi.string().isoDate().allow(''),
  /// Через запятую, формат id сервера: [a-z0-9-]{2,32}.
  GIVEAWAY_ALLOWED_SERVERS: Joi.string().allow(''),
  /// Капча на выдаче кода (ADR-G002 п. 2.6); по умолчанию выключена.
  GIVEAWAY_CAPTCHA_ENABLED: Joi.boolean().default(false),

  /// Общие опции интерактивных транзакций Prisma (ADR-0183): ожидание
  /// соединения для старта транзакции и предельная длительность. Prisma по
  /// умолчанию даёт 2000/5000 мс, что под нагрузкой даёт P2028.
  PRISMA_TX_MAX_WAIT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(30_000)
    .default(10_000),
  PRISMA_TX_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60_000)
    .default(10_000),
  /// Анонимный quick-buy (0.5, ADR-0186 Р5): аварийный выключатель. В dev/test
  /// по умолчанию включён, в production (и при пустом/неизвестном NODE_ENV)
  /// выключен, пока владелец не включит явно вместе с боевым запуском.
  QUICK_BUY_ENABLED: Joi.boolean().when('NODE_ENV', {
    is: NON_PRODUCTION_ENV,
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean().default(false),
  }),
  /// Платное снятие бана и мута (0.12b, ADR-0190): аварийный выключатель. В dev/test
  /// по умолчанию включён, в production (и при пустом/неизвестном NODE_ENV)
  /// выключен, пока владелец не включит явно. Работает вместе с настройкой
  /// `punishments.paidRemoval` (пустые правила = товар не оформляется).
  UNPUNISH_ENABLED: Joi.boolean().when('NODE_ENV', {
    is: NON_PRODUCTION_ENV,
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean().default(false),
  }),
  /// Жёсткий аварийный запрет выдачи купленного (0.7, ADR-0184 Р10, Q80): явный
  /// false выключает доставку независимо от настройки сайта
  /// `store.delivery.enabled`. Без значения решает настройка (по умолчанию выкл.).
  /// Значение не требует перезапуска только в смысле настройки; смена
  /// переменной — перезапуск процесса.
  STORE_DELIVERY_ENABLED: Joi.boolean().optional(),
  /// Фоновая сверка заданий выдачи (ADR-0184, «Реализация 0.7»): досоздаёт
  /// недостающие задания для COMPLETED-заказов. Явный false выключает сверку
  /// (по умолчанию включена: создание заданий инертно, пока доставка выключена).
  DELIVERY_RECONCILE_ENABLED: Joi.boolean().optional(),
  /// Журнал кошелька рубинов (0.15, ADR-0191). По умолчанию выкл.: API
  /// кошелька (история, админ) отвечает 503 `wallet_disabled`, исполнитель
  /// wallet не зачисляет, возврат рубинов — как до 0.15.
  WALLET_LEDGER_ENABLED: Joi.boolean().default(false),
  /// Потолок одной ручной корректировки, рубины (по модулю).
  WALLET_ADJUST_MAX: Joi.number()
    .integer()
    .min(1)
    .max(10000000)
    .default(100000),
  /// Суточный лимит суммы корректировок одного администратора (сумма модулей
  /// за скользящие 24 часа), рубины.
  WALLET_ADJUST_DAILY_MAX: Joi.number()
    .integer()
    .min(1)
    .max(1000000000)
    .default(500000),
  /// Возвраты и сверка платежей (0.9, ADR-0188). По умолчанию выкл.: эндпоинты
  /// возвратов отвечают 503 `refunds_disabled`, фоновая сверка не работает.
  STORE_REFUNDS_ENABLED: Joi.boolean().default(false),
  /// Сверять заказы старше N минут (после последней сверки — тоже не чаще).
  STORE_REFUNDS_RECONCILE_MIN_AGE_MINUTES: Joi.number()
    .integer()
    .min(1)
    .max(1440)
    .default(15),
  /// Окно сверки: заказы старше N часов не опрашиваются (по умолчанию 72).
  STORE_REFUNDS_RECONCILE_WINDOW_HOURS: Joi.number()
    .integer()
    .min(1)
    .max(720)
    .default(72),
  /// Срок REFUND_PENDING без ответа провайдера (часы), затем FAILED (0.9/0.11).
  STORE_REFUNDS_PENDING_TIMEOUT_HOURS: Joi.number()
    .integer()
    .min(1)
    .max(720)
    .default(72),
  /// Размер пачки одного прохода сверки.
  STORE_REFUNDS_RECONCILE_BATCH: Joi.number()
    .integer()
    .min(1)
    .max(500)
    .default(50),
};

const strongGiveawaySecret = Joi.string()
  .custom((value: string, helpers) =>
    isStrongMasterSecret(Buffer.from(value, 'utf8'))
      ? value
      : helpers.error('string.min'),
  )
  .messages({
    'any.required': 'GIVEAWAY_MASTER_SECRET обязателен при GIVEAWAY_ONLY=true',
    'string.empty': 'GIVEAWAY_MASTER_SECRET обязателен при GIVEAWAY_ONLY=true',
    'string.min':
      'GIVEAWAY_MASTER_SECRET: не короче 32 байт и не менее 16 различных байт',
  })
  .required();

const fullEnvSchema = Joi.object(envBaseKeys).unknown(true);

/// Режим GIVEAWAY_ONLY: переменные auth/2FA/captcha/cookie не требуются,
/// GIVEAWAY_ENABLED=true и GIVEAWAY_MASTER_SECRET обязательны (fail closed).
/// Остальные правила (NODE_ENV fail-closed, TRUST_PROXY, DATABASE_URL) прежние.
const giveawayOnlyEnvSchema = fullEnvSchema.keys({
  JWT_ACCESS_SECRET: Joi.string().allow('').optional(),
  JWT_REFRESH_SECRET: Joi.string().allow('').optional(),
  TWO_FACTOR_ENCRYPTION_KEY: Joi.string().allow('').optional(),
  TURNSTILE_SECRET_KEY: Joi.string().allow('').optional(),
  COOKIE_DOMAIN: Joi.string().allow('').optional(),
  COOKIE_SECURE: Joi.boolean().default(false),
  GIVEAWAY_ENABLED: Joi.boolean().valid(true).required().messages({
    'any.required': 'GIVEAWAY_ENABLED=true обязателен при GIVEAWAY_ONLY=true',
    'any.only': 'GIVEAWAY_ENABLED=true обязателен при GIVEAWAY_ONLY=true',
  }),
  GIVEAWAY_MASTER_SECRET: strongGiveawaySecret,
});

export const envValidationSchema = Joi.alternatives().conditional(
  Joi.object({ GIVEAWAY_ONLY: Joi.boolean().valid(true).required() }).unknown(
    true,
  ),
  { then: giveawayOnlyEnvSchema, otherwise: fullEnvSchema },
);
