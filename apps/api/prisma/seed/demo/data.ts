import type {
  AchievementCategory,
  AchievementConditionType,
  AchievementRarity,
  MinecraftPunishmentKind,
  MinecraftPunishmentStatus,
  NewsCategory,
  ProductDuration,
  ProductType,
  ReportStatus,
} from '@prisma/client';

/// Чистые фабрики демо-данных (без БД). Цены twomc.su; «от X» = цена варианта
/// на 1 месяц. Допущение: 3 месяца = x2.5, навсегда = x8 от месячной цены.
export const PRICE_3M_FACTOR = 2.5;
export const PRICE_FOREVER_FACTOR = 8;

export interface DemoCategory {
  slug: string;
  name: string;
  order: number;
}

export interface DemoVariant {
  duration: ProductDuration;
  price: number;
}

export interface DemoProduct {
  slug: string;
  name: string;
  description: string;
  type: ProductType;
  categorySlug: string;
  order: number;
  variants: DemoVariant[];
  gameCommands: string[];
  currencyAmount?: number;
  maxPerPurchase?: number;
  isFeatured?: boolean;
}

export const DEMO_CATEGORIES: DemoCategory[] = [
  { slug: 'privileges', name: 'Привилегии', order: 1 },
  { slug: 'cases', name: 'Кейсы', order: 2 },
  { slug: 'services', name: 'Услуги', order: 3 },
  { slug: 'rubies', name: 'Рубины', order: 4 },
  { slug: 'battle-pass', name: 'Боевой пропуск', order: 5 },
];

const PRIVILEGES: Array<[string, string, number]> = [
  ['polemizm', 'Полемизм', 1499],
  ['svarog', 'Сварог', 799],
  ['kratos', 'Кратос', 599],
  ['apolon', 'Аполон', 399],
  ['deimos', 'Деймос', 299],
  ['ares', 'Арес', 129],
  ['gefest', 'Гефест', 39],
];

function privilegeVariants(monthly: number): DemoVariant[] {
  return [
    { duration: 'MONTH_1', price: monthly },
    { duration: 'MONTHS_3', price: Math.round(monthly * PRICE_3M_FACTOR) },
    { duration: 'FOREVER', price: Math.round(monthly * PRICE_FOREVER_FACTOR) },
  ];
}

/// Команды выдачи — шаблоны для игрового сервера ({username} — ник получателя).
export function buildDemoProducts(): DemoProduct[] {
  const products: DemoProduct[] = [];
  let order = 1;
  for (const [slug, name, monthly] of PRIVILEGES) {
    products.push({
      slug,
      name,
      description: `Привилегия «${name}» (демо-данные)`,
      type: 'PRIVILEGE',
      categorySlug: 'privileges',
      order: order++,
      variants: privilegeVariants(monthly),
      gameCommands: [`lp user {username} parent add ${slug}`],
      isFeatured: slug === 'polemizm',
    });
  }
  const once = (price: number): DemoVariant[] => [
    { duration: 'ONE_TIME', price },
  ];
  const simple: Array<[string, string, ProductType, string, number, string]> = [
    [
      'case-donate',
      'Донат-кейс',
      'KEY',
      'cases',
      89,
      'crates key give {username} donate 1',
    ],
    [
      'case-title',
      'Титульный кейс',
      'KEY',
      'cases',
      19,
      'crates key give {username} title 1',
    ],
    [
      'case-ruby',
      'Рубиновый кейс',
      'KEY',
      'cases',
      79,
      'crates key give {username} ruby 1',
    ],
    ['unmute', 'Размут', 'UNMUTE', 'services', 89, 'unmute {username}'],
    ['unban', 'Разбан', 'UNBAN', 'services', 199, 'unban {username}'],
  ];
  for (const [slug, name, type, categorySlug, price, cmd] of simple) {
    products.push({
      slug,
      name,
      description: `${name} (демо-данные)`,
      type,
      categorySlug,
      order: order++,
      variants: once(price),
      gameCommands: [cmd],
    });
  }
  products.push({
    slug: 'rubies',
    name: 'Рубины',
    description: '1 рубль = 1 рубин, количество выбирается (демо-данные)',
    type: 'CURRENCY',
    categorySlug: 'rubies',
    order: order++,
    variants: once(1),
    gameCommands: ['rubies give {username} 1'],
    currencyAmount: 1,
    maxPerPurchase: 100000,
  });
  products.push({
    slug: 'battle-pass-premium',
    name: 'Боевой пропуск (премиум)',
    description: 'Премиум-пропуск текущего сезона (демо-данные)',
    type: 'BATTLE_PASS',
    categorySlug: 'battle-pass',
    order: order++,
    variants: [{ duration: 'SEASON', price: 299 }],
    gameCommands: ['battlepass premium {username}'],
  });
  return products;
}

export interface DemoNews {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: NewsCategory;
  daysAgo: number;
  isPinned?: boolean;
}

export const DEMO_NEWS: DemoNews[] = [
  {
    slug: 'demo-anarchy-new-era-start',
    title: 'Старт «Анархии Новой Эры»',
    excerpt: 'Открываем новый сезон анархии.',
    content: 'Демо-новость: новый сезон «Анархии Новой Эры» стартовал.',
    category: 'ANNOUNCEMENT',
    daysAgo: 1,
    isPinned: true,
  },
  {
    slug: 'demo-nullcord-network',
    title: 'Сеть серверов на NullCord',
    excerpt: 'Единый вход на все серверы.',
    content: 'Демо-новость: серверы объединены через NullCord.',
    category: 'UPDATE',
    daysAgo: 4,
  },
  {
    slug: 'demo-shop-update',
    title: 'Обновление магазина',
    excerpt: 'Новые товары и кейсы.',
    content: 'Демо-новость: в магазине появились кейсы и боевой пропуск.',
    category: 'PATCH_NOTES',
    daysAgo: 9,
  },
  {
    slug: 'demo-weekend-event',
    title: 'Событие выходных',
    excerpt: 'Турнир по выживанию.',
    content: 'Демо-новость: в выходные пройдёт турнир.',
    category: 'EVENT',
    daysAgo: 14,
  },
];

export interface DemoFormField {
  type: 'TEXT' | 'TEXTAREA' | 'SELECT' | 'NUMBER';
  label: string;
  isRequired: boolean;
  options?: string[];
}

export interface DemoForm {
  slug: string;
  title: string;
  description: string;
  fields: DemoFormField[];
  /// Ответы демо-заявки по индексу поля.
  sampleAnswers: Array<string | number>;
}

export const DEMO_FORMS: DemoForm[] = [
  {
    slug: 'demo-moderator-application',
    title: 'Заявка в модераторы',
    description: 'Демо-форма.',
    fields: [
      { type: 'TEXT', label: 'Ник', isRequired: true },
      { type: 'NUMBER', label: 'Возраст', isRequired: true },
      { type: 'TEXTAREA', label: 'Почему вы?', isRequired: true },
    ],
    sampleAnswers: ['DemoPlayer', 18, 'Хочу помогать игрокам.'],
  },
  {
    slug: 'demo-unban-appeal',
    title: 'Апелляция на разбан',
    description: 'Демо-форма.',
    fields: [
      { type: 'TEXT', label: 'Ник', isRequired: true },
      {
        type: 'SELECT',
        label: 'Тип наказания',
        isRequired: true,
        options: ['Бан', 'Мут'],
      },
      { type: 'TEXTAREA', label: 'Объяснение', isRequired: true },
    ],
    sampleAnswers: [
      'DemoBanned',
      'Бан',
      'Правила понятны, больше не повторится.',
    ],
  },
  {
    slug: 'demo-feedback',
    title: 'Обратная связь',
    description: 'Демо-форма.',
    fields: [{ type: 'TEXTAREA', label: 'Ваше предложение', isRequired: true }],
    sampleAnswers: ['Добавьте больше событий.'],
  },
];

export interface DemoServer {
  slug: string;
  name: string;
  address: string;
  type: string;
  description: string;
  order: number;
}

export const DEMO_SERVER_CATEGORY = {
  slug: 'demo-network',
  name: 'Сеть TwoMC (демо)',
};

export const DEMO_SERVERS: DemoServer[] = [
  {
    slug: 'anarchy-new-era',
    name: 'Анархия Новой Эры',
    address: 'localhost',
    type: 'anarchy',
    description: 'Анархия без правил, кроме базовых. Демо-описание.',
    order: 1,
  },
  {
    slug: 'nullcord-lobby',
    name: 'NullCord — лобби',
    address: 'localhost',
    type: 'lobby',
    description: 'Точка входа сети NullCord. Демо-описание.',
    order: 2,
  },
  {
    slug: 'survival',
    name: 'Выживание',
    address: 'localhost',
    type: 'survival',
    description: 'Классическое выживание. Демо-описание.',
    order: 3,
  },
];

export interface DemoPunishment {
  sourceId: number;
  kind: MinecraftPunishmentKind;
  subjectName: string;
  reason: string;
  status: MinecraftPunishmentStatus;
  daysAgo: number;
  durationDays: number | null;
  /// Только у демо-аккаунта «Мои наказания» (DEMO_PUNISHMENT_ACCOUNT).
  subjectUuid?: string;
}

/// ДЕМО: привязанный Minecraft-аккаунт демо-игрока для «Мои наказания».
/// uuid фиктивный, версии 4 (третья группа начинается с 4), НЕ офлайн-версии 3:
/// linkedUuid() в punishments-read.service.ts считает версию 3 «нет привязки».
/// Не принадлежит реальному игроку.
export const DEMO_PUNISHMENT_ACCOUNT = {
  username: 'demo_ember',
  uuid: 'de30c0de-0000-4000-8000-00000000e4b3',
  name: 'DemoEmber',
} as const;

/// Без IP и контактов; выдавший скрыт по умолчанию (Q31).
export const DEMO_PUNISHMENTS: DemoPunishment[] = [
  {
    sourceId: 9001,
    kind: 'BAN',
    subjectName: DEMO_PUNISHMENT_ACCOUNT.name,
    subjectUuid: DEMO_PUNISHMENT_ACCOUNT.uuid,
    reason: 'Грифинг',
    status: 'ACTIVE',
    daysAgo: 2,
    durationDays: null,
  },
  {
    sourceId: 9002,
    kind: 'MUTE',
    subjectName: 'DemoSpammer',
    reason: 'Спам в чате',
    status: 'ACTIVE',
    daysAgo: 1,
    durationDays: 7,
  },
  {
    sourceId: 9003,
    kind: 'WARN',
    subjectName: DEMO_PUNISHMENT_ACCOUNT.name,
    subjectUuid: DEMO_PUNISHMENT_ACCOUNT.uuid,
    reason: 'Оскорбления',
    status: 'EXPIRED',
    daysAgo: 20,
    durationDays: 10,
  },
  {
    sourceId: 9004,
    kind: 'KICK',
    subjectName: 'DemoAfk',
    reason: 'Долгое AFK',
    status: 'EXPIRED',
    daysAgo: 6,
    durationDays: 0,
  },
  {
    sourceId: 9005,
    kind: 'BAN',
    subjectName: 'DemoCheater',
    reason: 'Читы',
    status: 'EXPIRED',
    daysAgo: 40,
    durationDays: 30,
  },
  {
    sourceId: 9006,
    kind: 'MUTE',
    subjectName: 'DemoAds',
    reason: 'Реклама',
    status: 'REMOVED',
    daysAgo: 12,
    durationDays: 14,
  },
  {
    sourceId: 9007,
    kind: 'MUTE',
    subjectName: DEMO_PUNISHMENT_ACCOUNT.name,
    subjectUuid: DEMO_PUNISHMENT_ACCOUNT.uuid,
    reason: 'Флуд',
    status: 'EXPIRED',
    daysAgo: 9,
    durationDays: 3,
  },
];

export interface DemoAchievement {
  slug: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  conditionType: AchievementConditionType;
  conditionValue: number | null;
}

export const DEMO_ACHIEVEMENTS: DemoAchievement[] = [
  {
    slug: 'demo-first-hour',
    name: 'Первый час',
    description: 'Проведите час на сервере.',
    category: 'GAME',
    rarity: 'COMMON',
    conditionType: 'PLAYTIME_MINUTES',
    conditionValue: 60,
  },
  {
    slug: 'demo-socialite',
    name: 'Душа компании',
    description: 'Добавьте 5 друзей.',
    category: 'SOCIAL',
    rarity: 'RARE',
    conditionType: 'FRIENDS_COUNT',
    conditionValue: 5,
  },
  {
    slug: 'demo-veteran',
    name: 'Ветеран',
    description: 'Аккаунту 365 дней.',
    category: 'SPECIAL',
    rarity: 'EPIC',
    conditionType: 'ACCOUNT_AGE_DAYS',
    conditionValue: 365,
  },
];

export const DEMO_VOTE_SITE = {
  slug: 'demo-vote-site',
  name: 'Демо-рейтинг серверов',
  url: 'https://example.com/vote',
};

/// Только демо-сид; production-дефолт флага не меняется.
/// Стенд без Bridge и игрового сервера: разделы наполняются демо-данными, а не
/// скрываются. Исполнители выдачи (команда и Bridge) ЯВНО выключены: заказы
/// не уходят на игровой сервер. Правила платного снятия (punishments.paidRemoval)
/// не задаются: им нужен actorUserId системной записи, которую создаёт владелец.
export const DEMO_SETTINGS: Record<string, string> = {
  'punishments.public.enabled': 'true',
  'stats.public.enabled': 'true',
  'store.delivery.enabled': 'true',
  'store.delivery.executor.command.enabled': 'false',
  'store.delivery.executor.bridge.enabled': 'false',
};

export interface DemoAppeal {
  reportNumber: string;
  punishmentSourceId: number;
  punishmentKind: MinecraftPunishmentKind;
  status: ReportStatus;
  daysAgo: number;
  resolvedDaysAgo: number | null;
  description: string;
  verdict: string | null;
}

/// Обжалования demo_ember: отклонённое (старое) и на рассмотрении (новое).
/// Открыто только одно (частичный уникальный индекс reports_open_mc_appeal_uniq).
export const DEMO_APPEALS: DemoAppeal[] = [
  {
    reportNumber: 'R-DEMO-APPEAL-1',
    punishmentSourceId: 9001,
    punishmentKind: 'BAN',
    status: 'REJECTED',
    daysAgo: 1.5,
    resolvedDaysAgo: 1,
    description: '[Демо] Прошу пересмотреть блокировку: тестовое обжалование.',
    verdict: '[Демо] Отказано: тестовый вердикт стенда.',
  },
  {
    reportNumber: 'R-DEMO-APPEAL-2',
    punishmentSourceId: 9001,
    punishmentKind: 'BAN',
    status: 'IN_REVIEW',
    daysAgo: 0.5,
    resolvedDaysAgo: null,
    description: '[Демо] Повторное тестовое обжалование блокировки.',
    verdict: null,
  },
];

/// Публичный список читает только `source='litebans'`, `sourceScope='default'`
/// и требует `PunishmentSyncState.initialSyncDoneAt` по виду. Демо-строки кладутся
/// туда же; sourceId сдвинут, чтобы не пересечься с реальными id LiteBans.
export const DEMO_PUNISHMENT_SOURCE = 'litebans';
export const DEMO_PUNISHMENT_SCOPE = 'default';
export const DEMO_PUNISHMENT_ID_OFFSET = 900_000_000;
export const DEMO_PUNISHMENT_KINDS: MinecraftPunishmentKind[] = [
  'BAN',
  'MUTE',
  'WARN',
  'KICK',
];

export function demoPunishmentSourceId(sourceId: number): bigint {
  return BigInt(DEMO_PUNISHMENT_ID_OFFSET + sourceId);
}

/// Поля строки-зеркала: без IP и контактов, выдавший скрыт (Q31).
export function buildDemoPunishmentRow(p: DemoPunishment, now: Date) {
  const startedAt = new Date(now.getTime() - p.daysAgo * 86_400_000);
  return {
    subjectName: p.subjectName,
    subjectUuid: p.subjectUuid ?? null,
    reason: p.reason,
    status: p.status,
    startedAt,
    until:
      p.durationDays === null
        ? null
        : new Date(startedAt.getTime() + p.durationDays * 86_400_000),
    ipBan: false,
    executorIsConsole: true,
    issuerHidden: true,
    rowHash: `demo${String(p.sourceId).padStart(60, '0')}`,
  };
}

/// Состояние синхронизации «первичная загрузка выполнена» для каждого вида.
export function buildDemoSyncState(now: Date) {
  return DEMO_PUNISHMENT_KINDS.map((kind) => ({
    source: DEMO_PUNISHMENT_SOURCE,
    kind,
    initialSyncDoneAt: now,
    lastSuccessAt: now,
  }));
}

/// Контент для страниц /rules, /faq, /info и /events тестового стенда.
/// Нейтральный текст без санкций, цен и обязательств; настоящие правила
/// утверждает администрация.
export const DEMO_EVENT_DISCLAIMER =
  'Демонстрационное событие для тестового стенда.';

export const DEMO_CONTENT_DISCLAIMER =
  'Демонстрационный текст для тестового стенда; настоящие правила утверждает администрация.';

/// Заведомо не bcrypt-хеш: bcrypt.compare возвращает false, вход невозможен.
export const DEMO_AUTHOR = {
  username: 'demo_system',
  email: 'demo-system@example.invalid',
  discriminator: 0,
  password: '!demo-login-disabled',
} as const;

export function demoAuthorTag(): string {
  return `${DEMO_AUTHOR.username}#${String(DEMO_AUTHOR.discriminator).padStart(4, '0')}`;
}

export type DemoTopicCategory = 'RULES' | 'FAQ' | 'INFORMATION';

export interface DemoTopic {
  slug: string;
  title: string;
  category: DemoTopicCategory;
  description: string;
  body: string;
  order: number;
}

const eventContent = (body: string): string =>
  `${DEMO_EVENT_DISCLAIMER}\n\n${body}`;

const topicContent = (body: string): string =>
  `${DEMO_CONTENT_DISCLAIMER}\n\n${body}`;

export const DEMO_TOPICS: DemoTopic[] = [
  {
    slug: 'demo-rule-respect',
    title: '[Демо] Уважение к игрокам',
    category: 'RULES',
    description: 'Пример правила о общении.',
    body: 'Общайтесь вежливо и уважайте других участников сообщества.',
    order: 1,
  },
  {
    slug: 'demo-rule-fair-play',
    title: '[Демо] Честная игра',
    category: 'RULES',
    description: 'Пример правила об игровом процессе.',
    body: 'Играйте честно: примеры допустимого и недопустимого поведения определяет администрация.',
    order: 2,
  },
  {
    slug: 'demo-rule-reports',
    title: '[Демо] Обращения к администрации',
    category: 'RULES',
    description: 'Пример правила об обращениях.',
    body: 'Если вы заметили проблему, сообщите о ней через форму обращения на сайте.',
    order: 3,
  },
  {
    slug: 'demo-faq-start',
    title: '[Демо] Как начать играть?',
    category: 'FAQ',
    description: 'Пример ответа для новичков.',
    body: 'Зарегистрируйтесь на сайте, привяжите игровой аккаунт и подключитесь к серверу по адресу из раздела «Серверы».',
    order: 1,
  },
  {
    slug: 'demo-faq-link-account',
    title: '[Демо] Как привязать игровой аккаунт?',
    category: 'FAQ',
    description: 'Пример ответа о привязке аккаунта.',
    body: 'Откройте настройки профиля и следуйте подсказкам на странице привязки.',
    order: 2,
  },
  {
    slug: 'demo-faq-support',
    title: '[Демо] Куда обратиться за помощью?',
    category: 'FAQ',
    description: 'Пример ответа о поддержке.',
    body: 'Воспользуйтесь формами обратной связи на сайте или напишите в официальные каналы сообщества.',
    order: 3,
  },
  {
    slug: 'demo-faq-news',
    title: '[Демо] Где следить за новостями?',
    category: 'FAQ',
    description: 'Пример ответа о новостях.',
    body: 'Актуальные объявления публикуются в разделе «Новости» на сайте.',
    order: 4,
  },
  {
    slug: 'demo-info-about',
    title: '[Демо] О проекте',
    category: 'INFORMATION',
    description: 'Пример информационной страницы.',
    body: 'TwoMC — сообщество игроков Minecraft. Здесь собраны серверы, новости и инструменты для участников.',
    order: 1,
  },
  {
    slug: 'demo-info-servers',
    title: '[Демо] Как устроены серверы',
    category: 'INFORMATION',
    description: 'Пример информационной страницы о серверах.',
    body: 'Список серверов и адреса для подключения доступны в разделе «Серверы».',
    order: 2,
  },
].map((t) => ({ ...t, body: topicContent(t.body) })) as DemoTopic[];

export interface DemoEvent {
  slug: string;
  title: string;
  description: string;
  category: 'COMMUNITY' | 'UPDATE';
  /// Публичная выдача показывает только PUBLISHED; «прошедшее» задаётся датами.
  status: 'PUBLISHED';
  /// Смещение начала от «сейчас» в днях (отрицательное = прошедшее).
  startOffsetDays: number;
  durationHours: number;
  location: string;
  isFeatured: boolean;
}

export const DEMO_EVENTS: DemoEvent[] = [
  {
    slug: 'demo-event-upcoming',
    title: '[Демо] Встреча сообщества',
    description: eventContent(
      'Пример будущего события: открытая встреча игроков.',
    ),
    category: 'COMMUNITY',
    status: 'PUBLISHED',
    startOffsetDays: 7,
    durationHours: 2,
    location: 'Игровой сервер',
    isFeatured: true,
  },
  {
    slug: 'demo-event-past',
    title: '[Демо] Итоги прошлой встречи',
    description: eventContent('Пример прошедшего события: встреча состоялась.'),
    category: 'COMMUNITY',
    status: 'PUBLISHED',
    startOffsetDays: -14,
    durationHours: 2,
    location: 'Игровой сервер',
    isFeatured: false,
  },
];

export function buildDemoEventDates(
  e: DemoEvent,
  now: Date,
): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(now.getTime() + e.startOffsetDays * 86_400_000);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + e.durationHours * 3_600_000),
  };
}

/// Поля строки Topic; условия публичной выдачи TopicsService: isActive, PUBLIC.
export function buildDemoTopicRow(t: DemoTopic) {
  return {
    title: t.title,
    category: t.category,
    visibility: 'PUBLIC' as const,
    description: t.description,
    content: t.body,
    contentHtml: demoEscapeToHtml(t.body),
    order: t.order,
    isActive: true,
  };
}

/// Поля строки CalendarEvent; условия публичной выдачи EventsService:
/// status PUBLISHED, visibility PUBLIC (поля isPublic в модели нет).
export function buildDemoEventRow(e: DemoEvent, now: Date) {
  return {
    title: e.title,
    description: e.description,
    descriptionHtml: demoEscapeToHtml(e.description),
    category: e.category,
    status: e.status,
    visibility: 'PUBLIC' as const,
    location: e.location,
    isFeatured: e.isFeatured,
    ...buildDemoEventDates(e, now),
  };
}

/// Экранирование текста для contentHtml (как escapeToHtml в API).
export function demoEscapeToHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r\n|\r|\n/g, '<br>');
}
