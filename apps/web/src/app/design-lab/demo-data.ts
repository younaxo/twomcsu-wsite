/// Реалистичный демо-контент для /design-lab (не Lorem Ipsum, не fake
/// production-метрики — только иллюстративные значения для сравнения
/// визуального языка). Один набор для всех трёх направлений.

export interface DemoUser {
  id: string;
  username: string;
  tag: string;
  role: string;
  roleColor: string | null;
  online: boolean;
  avatar: string | null;
  playtimeHours: number;
  joinedAt: string;
  banned?: boolean;
}

export interface DemoServer {
  id: string;
  name: string;
  slug: string;
  version: string;
  online: boolean;
  players: number;
  maxPlayers: number;
  pingMs: number | null;
  motd: string;
}

export interface DemoNews {
  id: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  author: string;
  comments: number;
}

export interface DemoEvent {
  id: string;
  title: string;
  startsAt: string;
  participants: number;
  server: string;
}

export interface DemoProduct {
  id: string;
  name: string;
  type: string;
  price: number;
  oldPrice: number | null;
  period: string;
}

export interface DemoAuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  severity: 'info' | 'warning' | 'critical';
  at: string;
}

export interface DemoNotification {
  id: string;
  title: string;
  message: string;
  at: string;
  read: boolean;
  kind: 'friend' | 'order' | 'moderation' | 'system';
}

const head = (name: string) => `https://mc-heads.net/avatar/${name}/64`;

export const demoUsers: DemoUser[] = [
  {
    id: 'u1',
    username: 'Steve_Mainer',
    tag: 'Steve_Mainer#4a2b',
    role: 'Игрок',
    roleColor: null,
    online: true,
    avatar: head('Steve'),
    playtimeHours: 412,
    joinedAt: '2024-03-14T10:20:00Z',
  },
  {
    id: 'u2',
    username: 'EnderQueen',
    tag: 'EnderQueen#91c3',
    role: 'Старший модератор',
    roleColor: '#1C8A56',
    online: true,
    avatar: head('Alex'),
    playtimeHours: 1280,
    joinedAt: '2023-07-02T18:05:00Z',
  },
  {
    id: 'u3',
    username: 'xX_Notch_Xx',
    tag: 'xX_Notch_Xx#0f11',
    role: 'VIP',
    roleColor: '#F26A1B',
    online: false,
    avatar: head('Notch'),
    playtimeHours: 96,
    joinedAt: '2025-01-21T12:00:00Z',
  },
  {
    id: 'u4',
    username: 'Kleek',
    tag: 'Kleek#0001',
    role: 'Owner',
    roleColor: '#C8460A',
    online: true,
    avatar: head('Herobrine'),
    playtimeHours: 3010,
    joinedAt: '2022-11-05T09:00:00Z',
  },
  {
    id: 'u5',
    username: 'younaxo_',
    tag: 'younaxo_#0002',
    role: 'Chief Curator',
    roleColor: '#1E70B8',
    online: true,
    avatar: head('jeb_'),
    playtimeHours: 2210,
    joinedAt: '2022-11-05T09:30:00Z',
  },
  {
    id: 'u6',
    username: 'dizikk',
    tag: 'dizikk#0003',
    role: 'Senior Curator',
    roleColor: '#1E70B8',
    online: false,
    avatar: head('dizikk'),
    playtimeHours: 1540,
    joinedAt: '2023-01-15T14:10:00Z',
  },
  {
    id: 'u7',
    username: 'CreeperHunter',
    tag: 'CreeperHunter#7e2a',
    role: 'Хелпер',
    roleColor: '#C48008',
    online: true,
    avatar: head('Creeper'),
    playtimeHours: 640,
    joinedAt: '2024-09-09T16:40:00Z',
  },
  {
    id: 'u8',
    username: 'Lava_Walker',
    tag: 'Lava_Walker#33d0',
    role: 'Игрок',
    roleColor: null,
    online: false,
    avatar: head('Lava'),
    playtimeHours: 18,
    joinedAt: '2026-09-30T20:15:00Z',
    banned: true,
  },
];

export const demoServers: DemoServer[] = [
  {
    id: 's1',
    name: 'Survival #1',
    slug: 'survival-1',
    version: '1.21.4',
    online: true,
    players: 128,
    maxPlayers: 500,
    pingMs: 24,
    motd: 'Выживание без привата · сезон 7',
  },
  {
    id: 's2',
    name: 'SkyBlock',
    slug: 'skyblock',
    version: '1.21.4',
    online: true,
    players: 64,
    maxPlayers: 200,
    pingMs: 31,
    motd: 'Острова, рынок, кланы',
  },
  {
    id: 's3',
    name: 'Creative',
    slug: 'creative',
    version: '1.21.1',
    online: true,
    players: 17,
    maxPlayers: 100,
    pingMs: 19,
    motd: 'Участки 256×256, WorldEdit',
  },
  {
    id: 's4',
    name: 'Anarchy',
    slug: 'anarchy',
    version: '1.20.6',
    online: false,
    players: 0,
    maxPlayers: 150,
    pingMs: null,
    motd: 'Техработы до 20:00',
  },
];

export const demoNews: DemoNews[] = [
  {
    id: 'n1',
    title: 'Обновление 1.21 уже на сервере',
    excerpt:
      'Пробные камеры, медные гриды и новые заклинания у Breeze. Переходите на актуальную версию клиента.',
    publishedAt: '2026-10-06T15:00:00Z',
    author: 'EnderQueen',
    comments: 42,
  },
  {
    id: 'n2',
    title: 'Турнир по PvP в эти выходные',
    excerpt:
      'Регистрация открыта до пятницы. Призовой фонд — 3 ключа «Легендарный» и VIP на месяц.',
    publishedAt: '2026-10-04T12:30:00Z',
    author: 'Kleek',
    comments: 17,
  },
  {
    id: 'n3',
    title: 'Сезон 7 Survival: что изменилось',
    excerpt: 'Новый спавн, экономика на алмазах и лимит на приват 400 блоков.',
    publishedAt: '2026-09-28T09:00:00Z',
    author: 'younaxo_',
    comments: 88,
  },
];

export const demoEvents: DemoEvent[] = [
  {
    id: 'e1',
    title: 'Турнир по PvP',
    startsAt: '2026-10-11T17:00:00Z',
    participants: 36,
    server: 'Survival #1',
  },
  {
    id: 'e2',
    title: 'Конкурс построек: осень',
    startsAt: '2026-10-18T14:00:00Z',
    participants: 12,
    server: 'Creative',
  },
];

export const demoProducts: DemoProduct[] = [
  {
    id: 'p1',
    name: 'VIP на 30 дней',
    type: 'Привилегия',
    price: 299,
    oldPrice: 399,
    period: '30 дней',
  },
  {
    id: 'p2',
    name: 'Ключ от кейса «Легендарный»',
    type: 'Ключ',
    price: 149,
    oldPrice: null,
    period: 'навсегда',
  },
  {
    id: 'p3',
    name: 'Подписка Battle Pass',
    type: 'Подписка',
    price: 499,
    oldPrice: null,
    period: 'сезон',
  },
];

export const demoAudit: DemoAuditEntry[] = [
  {
    id: 'a1',
    actor: 'EnderQueen',
    action: 'user.ban',
    target: 'Lava_Walker',
    severity: 'warning',
    at: '2026-10-08T11:42:00Z',
  },
  {
    id: 'a2',
    actor: 'younaxo_',
    action: 'settings.site.update',
    target: 'SiteSettings',
    severity: 'info',
    at: '2026-10-08T10:15:00Z',
  },
  {
    id: 'a3',
    actor: 'Kleek',
    action: 'roles.permissions.update',
    target: 'Старший модератор',
    severity: 'critical',
    at: '2026-10-07T21:03:00Z',
  },
  {
    id: 'a4',
    actor: 'CreeperHunter',
    action: 'notification.broadcast',
    target: 'Announcement',
    severity: 'info',
    at: '2026-10-07T18:30:00Z',
  },
  {
    id: 'a5',
    actor: 'EnderQueen',
    action: 'user.unban',
    target: 'xX_Notch_Xx',
    severity: 'info',
    at: '2026-10-06T09:12:00Z',
  },
];

export const demoNotifications: DemoNotification[] = [
  {
    id: 'nt1',
    title: 'Заявка в друзья',
    message: 'CreeperHunter хочет добавить вас в друзья.',
    at: '2026-10-08T12:01:00Z',
    read: false,
    kind: 'friend',
  },
  {
    id: 'nt2',
    title: 'Заказ оплачен',
    message: 'VIP на 30 дней выдан на Survival #1.',
    at: '2026-10-08T09:40:00Z',
    read: false,
    kind: 'order',
  },
  {
    id: 'nt3',
    title: 'Ответ модератора',
    message: 'По обращению #2041 вынесен вердикт.',
    at: '2026-10-07T16:20:00Z',
    read: true,
    kind: 'moderation',
  },
];

export const demoStats = {
  usersTotal: 18420,
  usersOnline: 209,
  usersNewToday: 37,
  usersBanned: 112,
  pendingReports: 6,
  pendingCommentReports: 2,
  pendingProfileReports: 1,
};

export const demoPermissionsByModule: Record<string, string[]> = {
  users: ['users.view', 'users.ban', 'users.mute', 'users.warn', 'users.kick', 'users.export'],
  roles: ['roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'roles.assign'],
  news: ['news.view', 'news.create', 'news.edit', 'news.delete', 'news.pin'],
  store: ['store.products.view', 'store.products.edit', 'orders.view', 'orders.refund'],
};
