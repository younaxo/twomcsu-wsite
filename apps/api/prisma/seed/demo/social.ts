import { createHash } from 'crypto';
import { DEMO_AUTHOR, demoEscapeToHtml } from './data';

/// Демо-соцданные для стенда: игроки, статистика, снимки инвентаря, дружбы,
/// диалоги и комментарии профиля. Все ники вымышленные (префикс `demo_`),
/// почта на .invalid, пароль не bcrypt-хеш (вход невозможен). Без ролей/2FA.
export const DEMO_USER_PASSWORD = DEMO_AUTHOR.password;
export const DEMO_INVENTORY_SERVER_SLUG = 'anarchy-new-era';
export const DEMO_INVENTORY_EPOCH = 'demo-epoch';

export interface DemoPlayer {
  username: string;
  statusText: string;
  bio: string;
  stats: {
    coins: number;
    playTime: number;
    kills: number;
    deaths: number;
    hits: number;
  };
  /// Состав инвентаря: [id предмета, количество] для хотбара и Ender Chest.
  hotbar: Array<[string, number]>;
  ender: Array<[string, number]>;
}

const DEMO_BIO = '[Демо] Тестовый профиль для стенда.';

export const DEMO_PLAYERS: readonly DemoPlayer[] = [
  {
    username: 'demo_ember',
    statusText: '[Демо] На охоте',
    bio: DEMO_BIO,
    stats: { coins: 5400, playTime: 9120, kills: 312, deaths: 96, hits: 4410 },
    hotbar: [
      ['minecraft:diamond_sword', 1],
      ['minecraft:golden_apple', 12],
      ['minecraft:ender_pearl', 16],
    ],
    ender: [
      ['minecraft:netherite_ingot', 7],
      ['minecraft:totem_of_undying', 2],
    ],
  },
  {
    username: 'demo_frost',
    statusText: '[Демо] Строю базу',
    bio: DEMO_BIO,
    stats: { coins: 2100, playTime: 6840, kills: 88, deaths: 120, hits: 1530 },
    hotbar: [
      ['minecraft:diamond_pickaxe', 1],
      ['minecraft:torch', 64],
      ['minecraft:cooked_beef', 32],
    ],
    ender: [['minecraft:diamond_block', 5]],
  },
  {
    username: 'demo_gale',
    statusText: '[Демо] В сети по вечерам',
    bio: DEMO_BIO,
    stats: { coins: 980, playTime: 3300, kills: 41, deaths: 55, hits: 702 },
    hotbar: [
      ['minecraft:bow', 1],
      ['minecraft:arrow', 64],
    ],
    ender: [['minecraft:emerald', 48]],
  },
  {
    username: 'demo_ivy',
    statusText: '[Демо] Фермер',
    bio: DEMO_BIO,
    stats: { coins: 7300, playTime: 12480, kills: 12, deaths: 9, hits: 260 },
    hotbar: [
      ['minecraft:iron_hoe', 1],
      ['minecraft:wheat', 64],
      ['minecraft:bread', 20],
    ],
    ender: [['minecraft:gold_ingot', 36]],
  },
  {
    username: 'demo_onyx',
    statusText: '[Демо] PvP',
    bio: DEMO_BIO,
    stats: { coins: 3600, playTime: 7710, kills: 540, deaths: 210, hits: 8120 },
    hotbar: [
      ['minecraft:netherite_sword', 1],
      ['minecraft:shield', 1],
      ['minecraft:golden_apple', 8],
    ],
    ender: [['minecraft:shulker_box', 3]],
  },
  {
    username: 'demo_pixel',
    statusText: '[Демо] Новичок',
    bio: DEMO_BIO,
    stats: { coins: 150, playTime: 420, kills: 2, deaths: 7, hits: 35 },
    hotbar: [
      ['minecraft:stone_sword', 1],
      ['minecraft:bread', 6],
    ],
    ender: [],
  },
];

export const demoPlayerEmail = (username: string): string =>
  `${username.replace(/_/g, '-')}@example.invalid`;

export const demoPlayerTag = (username: string): string => `${username}#0000`;

/// K/D как в игровом счётчике: kills/deaths, при deaths=0 — kills; 2 знака.
export function demoKillDeathRatio(kills: number, deaths: number): number {
  const ratio = deaths === 0 ? kills : kills / deaths;
  return Math.round(ratio * 100) / 100;
}

export function buildDemoStatsRow(p: DemoPlayer) {
  return {
    ...p.stats,
    killDeathRatio: demoKillDeathRatio(p.stats.kills, p.stats.deaths),
    lastServer: DEMO_INVENTORY_SERVER_SLUG,
  };
}

/// type, а не interface: значение кладётся в Json-колонку Prisma.
export type DemoSlot = {
  area: 'hotbar' | 'ender';
  slot: number;
  item: { id: string; count: number };
};

export function buildDemoInventorySlots(
  p: DemoPlayer,
  group: 'main' | 'ender',
): DemoSlot[] {
  const area = group === 'main' ? 'hotbar' : 'ender';
  const source = group === 'main' ? p.hotbar : p.ender;
  return source.map(([id, count], slot) => ({
    area,
    slot,
    item: { id, count },
  }));
}

/// Канонический JSON (ключи отсортированы) — как canonicalJson в API.
export function demoCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(demoCanonicalJson).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${demoCanonicalJson(obj[k])}`)
    .join(',')}}`;
}

export function demoSlotsHash(slots: readonly DemoSlot[]): string {
  return createHash('sha256').update(demoCanonicalJson(slots)).digest('hex');
}

export function buildDemoInventoryRow(
  p: DemoPlayer,
  group: 'main' | 'ender',
  now: Date,
) {
  const slots = buildDemoInventorySlots(p, group);
  return {
    epoch: DEMO_INVENTORY_EPOCH,
    rev: 1,
    slots,
    slotCount: slots.length,
    contentHash: demoSlotsHash(slots),
    capturedAt: now,
    lastSeenAt: now,
    playerOnline: false,
    schemaVersion: 1,
  };
}

/// Дружбы между демо-пользователями: [заявитель, адресат, статус].
export const DEMO_FRIENDSHIPS: ReadonlyArray<
  readonly [string, string, 'ACCEPTED' | 'PENDING']
> = [
  ['demo_ember', 'demo_frost', 'ACCEPTED'],
  ['demo_ember', 'demo_onyx', 'ACCEPTED'],
  ['demo_frost', 'demo_gale', 'ACCEPTED'],
  ['demo_gale', 'demo_ivy', 'ACCEPTED'],
  ['demo_onyx', 'demo_ivy', 'ACCEPTED'],
  ['demo_pixel', 'demo_ember', 'PENDING'],
];

export interface DemoMessage {
  id: string;
  sender: string;
  text: string;
  minutesAgo: number;
}

export interface DemoConversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string | null;
  owner: string;
  members: string[];
  messages: DemoMessage[];
}

export const DEMO_CONVERSATIONS: readonly DemoConversation[] = [
  {
    id: 'demo-conv-direct-ember-frost',
    type: 'DIRECT',
    title: null,
    owner: 'demo_ember',
    members: ['demo_ember', 'demo_frost'],
    messages: [
      {
        id: 'demo-dm-1',
        sender: 'demo_ember',
        text: '[Демо] Привет! Идёшь вечером на ивент?',
        minutesAgo: 180,
      },
      {
        id: 'demo-dm-2',
        sender: 'demo_frost',
        text: '[Демо] Да, буду. Возьму зелья.',
        minutesAgo: 165,
      },
      {
        id: 'demo-dm-3',
        sender: 'demo_ember',
        text: '[Демо] Отлично, встречаемся на спавне.',
        minutesAgo: 150,
      },
    ],
  },
  {
    id: 'demo-conv-group-team',
    type: 'GROUP',
    title: '[Демо] Команда стенда',
    owner: 'demo_onyx',
    members: ['demo_onyx', 'demo_ember', 'demo_gale', 'demo_ivy'],
    messages: [
      {
        id: 'demo-gm-1',
        sender: 'demo_onyx',
        text: '[Демо] Это демонстрационная беседа для тестового стенда.',
        minutesAgo: 600,
      },
      {
        id: 'demo-gm-2',
        sender: 'demo_gale',
        text: '[Демо] Всем привет!',
        minutesAgo: 590,
      },
      {
        id: 'demo-gm-3',
        sender: 'demo_ivy',
        text: '[Демо] Кто сегодня на ферме?',
        minutesAgo: 120,
      },
    ],
  },
];

export const demoDirectKey = (idA: string, idB: string): string =>
  [idA, idB].sort().join(':');

export interface DemoProfileComment {
  id: string;
  profile: string;
  author: string;
  text: string;
  parentId?: string;
  daysAgo: number;
}

export const DEMO_PROFILE_COMMENTS: readonly DemoProfileComment[] = [
  {
    id: 'demo-pc-1',
    profile: 'demo_ember',
    author: 'demo_frost',
    text: '[Демо] Отличный игрок, рекомендую!',
    daysAgo: 5,
  },
  {
    id: 'demo-pc-2',
    profile: 'demo_ember',
    author: 'demo_ember',
    text: '[Демо] Спасибо!',
    parentId: 'demo-pc-1',
    daysAgo: 4,
  },
  {
    id: 'demo-pc-3',
    profile: 'demo_ember',
    author: 'demo_onyx',
    text: '[Демо] Хороший бой вчера.',
    daysAgo: 2,
  },
  {
    id: 'demo-pc-4',
    profile: 'demo_ivy',
    author: 'demo_gale',
    text: '[Демо] Спасибо за урожай!',
    daysAgo: 3,
  },
  {
    id: 'demo-pc-5',
    profile: 'demo_onyx',
    author: 'demo_pixel',
    text: '[Демо] Научишь играть в PvP?',
    daysAgo: 1,
  },
];

export const demoCommentHtml = (text: string): string =>
  demoEscapeToHtml(text);
