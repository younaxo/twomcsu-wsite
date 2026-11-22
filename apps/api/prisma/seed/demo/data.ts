import type {
  AchievementCategory,
  AchievementConditionType,
  AchievementRarity,
  MinecraftPunishmentKind,
  MinecraftPunishmentStatus,
  NewsCategory,
  ProductDuration,
  ProductType,
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
}

/// Без IP и контактов; выдавший скрыт по умолчанию (Q31).
export const DEMO_PUNISHMENTS: DemoPunishment[] = [
  {
    sourceId: 9001,
    kind: 'BAN',
    subjectName: 'DemoGriefer',
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
    subjectName: 'DemoToxic',
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
export const DEMO_SETTINGS: Record<string, string> = {
  'punishments.public.enabled': 'true',
};
