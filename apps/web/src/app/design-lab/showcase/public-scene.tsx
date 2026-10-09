'use client';

import { Menu, MessageCircle, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UserHoverCard } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { RolePrefix } from '@/components/ui/role-prefix';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import {
  demoEvents,
  demoNews,
  demoNotifications,
  demoProducts,
  demoServers,
  demoStats,
  demoUsers,
  type DemoNews,
  type DemoProduct,
  type DemoServer,
  type DemoUser,
} from '../demo-data';
import {
  AccountMenu,
  EventCard,
  NotificationBell,
  NotificationList,
  plural,
  roleOf,
} from './shared';

/* ------------------------------------------------------------------ */
/* Навигация                                                           */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: 'Новости', href: '#daylight-news' },
  { label: 'Сервера', href: '#daylight-servers', active: true },
  { label: 'Магазин', href: '#daylight-store' },
  { label: 'События', href: '#daylight-events' },
  { label: 'Топ', href: '#daylight-profile' },
] as const;

const currentUser = demoUsers.find((user) => user.username === 'Steve_Mainer') ?? demoUsers[0];

function Navbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="rounded-lg border bg-surface shadow-sm">
      <nav aria-label="Основная навигация" className="flex h-16 items-center gap-2 px-4 md:px-6">
        <a
          href="#daylight-public-title"
          className="mr-4 rounded-sm font-display text-xl font-bold tracking-tight"
        >
          TwoMC
        </a>
        <ul className="hidden items-center md:flex">
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <a
                href={item.href}
                aria-current={'active' in item ? 'page' : undefined}
                className={cn(
                  'relative inline-flex h-16 items-center px-3 text-sm font-medium transition-colors duration-fast',
                  'active' in item
                    ? 'text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden w-56 lg:block">
            <Input leading={<Search />} placeholder="Поиск по сайту" aria-label="Поиск по сайту" />
          </div>
          <NotificationBell />
          <AccountMenu user={currentUser} />
          <IconButton aria-label="Открыть меню" className="md:hidden" onClick={onOpenMenu}>
            <Menu />
          </IconButton>
        </div>
      </nav>
    </header>
  );
}

function MobileMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" size="sm" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-bold tracking-tight">TwoMC</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6">
          <Input leading={<Search />} placeholder="Поиск по сайту" aria-label="Поиск по сайту" />
          <nav aria-label="Разделы сайта">
            <ul className="flex flex-col gap-0.5">
              {NAV_ITEMS.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    aria-current={'active' in item ? 'page' : undefined}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      'flex h-12 items-center rounded px-3 text-base font-medium transition-colors duration-fast',
                      'active' in item
                        ? 'bg-primary-soft text-primary-soft-foreground'
                        : 'text-foreground hover:bg-muted',
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto flex items-center gap-3 border-t border-border-subtle pt-4">
            <Avatar name={currentUser.username} src={currentUser.avatar} shape="round" />
            <div className="min-w-0">
              <p className="truncate font-medium">{currentUser.username}</p>
              <p className="truncate font-mono text-xs text-subtle-foreground">{currentUser.tag}</p>
            </div>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Hero — signature направления                                        */
/* ------------------------------------------------------------------ */

function Hero() {
  const online = demoUsers.filter((user) => user.online);
  const serversOnline = demoServers.filter((server) => server.online);
  const busiest = [...demoServers].sort((a, b) => b.players - a.players)[0];
  const nextEvent = demoEvents[0];

  return (
    <section
      aria-labelledby="daylight-hero-title"
      className="grid gap-8 py-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-12 lg:py-8"
    >
      <h4
        id="daylight-hero-title"
        className="max-w-5xl font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl xl:text-6xl lg:col-span-2"
      >
        На сервере людно: седьмой сезон и турнир в выходные.
      </h4>

      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
          <AvatarStack
            size="lg"
            max={5}
            users={online.map((user) => ({ id: user.id, name: user.username, src: user.avatar }))}
          />
          <div>
            <p className="font-display text-2xl font-bold leading-tight tracking-tight tabular">
              {formatNumber(demoStats.usersOnline)}{' '}
              {plural(demoStats.usersOnline, { one: 'игрок', few: 'игрока', many: 'игроков' })}{' '}
              онлайн
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              {serversOnline.length} из {demoServers.length} серверов открыты, больше всего людей на{' '}
              {busiest.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href="#daylight-servers">Выбрать сервер</a>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <a href="#daylight-news">Что нового</a>
          </Button>
        </div>
      </div>

      <EventCard event={nextEvent} label="Ближайшее событие" titleAs="h5" />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Сервера                                                             */
/* ------------------------------------------------------------------ */

function ServerRow({ server }: { server: DemoServer }) {
  const fill = server.online ? Math.round((server.players / server.maxPlayers) * 100) : 0;
  return (
    <li className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-center md:gap-8 md:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold leading-tight">{server.name}</p>
          <StatusBadge status={server.online ? 'online' : 'offline'} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{server.motd}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium tabular">
            <span className="sr-only">Игроков: </span>
            {formatNumber(server.players)}
            <span className="text-muted-foreground"> / {formatNumber(server.maxPlayers)}</span>
          </span>
          <span className="text-xs tabular text-subtle-foreground">{fill}%</span>
        </p>
        <Progress value={fill} size="sm" label={`Заполненность ${server.name}`} />
      </div>
      <dl className="flex gap-6 text-sm md:justify-end">
        <div className="min-w-16">
          <dt className="text-xs text-subtle-foreground">Версия</dt>
          <dd className="font-mono">{server.version}</dd>
        </div>
        <div className="min-w-16">
          <dt className="text-xs text-subtle-foreground">Пинг</dt>
          <dd className="font-mono tabular">
            {server.pingMs === null ? '—' : `${formatNumber(server.pingMs)} мс`}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function ServersBoard() {
  const onlineCount = demoServers.filter((server) => server.online).length;
  return (
    <section
      id="daylight-servers"
      aria-labelledby="daylight-servers-title"
      className="flex scroll-mt-24 flex-col gap-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h5 id="daylight-servers-title" className="font-display text-2xl font-bold tracking-tight">
          Сервера
        </h5>
        <p className="text-sm text-muted-foreground">
          {onlineCount} из {demoServers.length} онлайн
        </p>
      </div>
      <Card flush>
        <ul className="divide-y divide-border-subtle">
          {demoServers.map((server) => (
            <ServerRow key={server.id} server={server} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Новости — редакционная типографика                                  */
/* ------------------------------------------------------------------ */

function AuthorLink({ username }: { username: string }) {
  const author = demoUsers.find((user) => user.username === username);
  if (!author) {
    return <span className="font-medium text-foreground">{username}</span>;
  }
  return (
    <UserHoverCard
      username={author.username}
      tag={author.tag}
      role={author.role}
      roleColor={author.roleColor}
      online={author.online}
      avatar={author.avatar}
      description={`Наиграно ${formatNumber(author.playtimeHours)} ч, в проекте с ${formatDate(author.joinedAt)}`}
    >
      <a
        href="#daylight-profile"
        className="inline-flex items-center gap-2 rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        <Avatar name={author.username} src={author.avatar} size="xs" shape="round" />
        {author.username}
      </a>
    </UserHoverCard>
  );
}

function NewsMeta({ item }: { item: DemoNews }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <AuthorLink username={item.author} />
      <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
      <span>
        {formatNumber(item.comments)}{' '}
        {plural(item.comments, { one: 'комментарий', few: 'комментария', many: 'комментариев' })}
      </span>
    </div>
  );
}

function FeaturedNews({ item }: { item: DemoNews }) {
  return (
    <article>
      <Card className="flex flex-col gap-5 md:flex-row md:gap-8">
        <div
          aria-hidden
          className="flex aspect-[16/10] w-full shrink-0 items-center justify-center rounded bg-surface-sunken text-xs text-subtle-foreground md:w-64"
        >
          Обложка 16:10
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h6 className="font-serif text-2xl font-semibold leading-snug md:text-3xl">
            <a
              href="#daylight-news"
              className="rounded-sm decoration-primary/60 underline-offset-4 hover:underline"
            >
              {item.title}
            </a>
          </h6>
          <p className="font-serif text-base leading-relaxed text-muted-foreground md:text-lg">
            {item.excerpt}
          </p>
          <div className="mt-auto pt-2">
            <NewsMeta item={item} />
          </div>
        </div>
      </Card>
    </article>
  );
}

function NewsCard({ item }: { item: DemoNews }) {
  return (
    <article>
      <Card className="flex h-full flex-col gap-3">
        <h6 className="font-serif text-xl font-semibold leading-snug">
          <a
            href="#daylight-news"
            className="rounded-sm decoration-primary/60 underline-offset-4 hover:underline"
          >
            {item.title}
          </a>
        </h6>
        <p className="line-clamp-3 font-serif text-base leading-relaxed text-muted-foreground">
          {item.excerpt}
        </p>
        <div className="mt-auto pt-2">
          <NewsMeta item={item} />
        </div>
      </Card>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Магазин                                                             */
/* ------------------------------------------------------------------ */

function ProductCard({ product }: { product: DemoProduct }) {
  const discount =
    product.oldPrice !== null ? Math.round((1 - product.price / product.oldPrice) * 100) : null;
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted-foreground">{product.type}</p>
        <h6 className="font-display text-xl font-bold leading-tight tracking-tight">
          {product.name}
        </h6>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-display text-3xl font-bold tracking-tight tabular">
          {formatMoney(product.price)}
        </p>
        {product.oldPrice !== null ? (
          <s className="text-muted-foreground tabular">
            <span className="sr-only">Старая цена: </span>
            {formatMoney(product.oldPrice)}
          </s>
        ) : null}
        {discount !== null ? <Badge tone="primary">−{discount}%</Badge> : null}
      </div>
      <p className="text-sm text-muted-foreground">Срок действия: {product.period}</p>
      <Button onClick={() => toast.success('Добавлено в корзину', { description: product.name })}>
        В корзину
      </Button>
    </Card>
  );
}

function StoreAside() {
  const [featured, ...others] = demoProducts;
  return (
    <div id="daylight-store" className="flex scroll-mt-24 flex-col gap-5">
      <h5 className="font-display text-2xl font-bold tracking-tight">Магазин</h5>
      <ProductCard product={featured} />
      <ul className="flex flex-col divide-y divide-border-subtle">
        {others.map((product) => (
          <li key={product.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{product.name}</p>
              <p className="text-sm text-muted-foreground">{product.period}</p>
            </div>
            <p className="font-medium tabular">{formatMoney(product.price)}</p>
            <Button
              variant="secondary"
              onClick={() => toast.success('Добавлено в корзину', { description: product.name })}
            >
              В корзину
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Профиль                                                             */
/* ------------------------------------------------------------------ */

function ProfileCard({ user }: { user: DemoUser }) {
  const rank =
    [...demoUsers]
      .sort((a, b) => b.playtimeHours - a.playtimeHours)
      .findIndex((candidate) => candidate.id === user.id) + 1;

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={user.username} src={user.avatar} size="xl" shape="round" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h5 className="font-display text-2xl font-bold tracking-tight">{user.username}</h5>
            <StatusBadge status={user.online ? 'online' : 'offline'} />
          </div>
          <p className="mt-0.5 font-mono text-sm text-subtle-foreground">{user.tag}</p>
          <div className="mt-3">
            <RolePrefix role={roleOf(user)} size="sm" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              toast.success('Заявка отправлена', {
                description: `${user.username} получит уведомление`,
              })
            }
          >
            <UserPlus />
            Добавить в друзья
          </Button>
          <Button variant="secondary" onClick={() => toast.message(`Диалог с ${user.username}`)}>
            <MessageCircle />
            Написать
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border-subtle pt-5 sm:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">Наиграно</dt>
          <dd className="mt-1 font-display text-xl font-bold tabular">
            {formatNumber(user.playtimeHours)} ч
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Место по времени</dt>
          <dd className="mt-1 font-display text-xl font-bold tabular">
            {rank} из {demoUsers.length}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">В проекте с</dt>
          <dd className="mt-1 font-display text-xl font-bold tabular">
            {formatDate(user.joinedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Роль</dt>
          <dd className="mt-1 font-display text-xl font-bold">{user.role}</dd>
        </div>
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Сцена                                                               */
/* ------------------------------------------------------------------ */

export function PublicScene() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [featured, ...restNews] = demoNews;
  const laterEvent = demoEvents[1];
  const profileUser = demoUsers.find((user) => user.username === 'EnderQueen') ?? demoUsers[0];

  return (
    <div className="flex flex-col gap-12 lg:gap-16">
      <Navbar onOpenMenu={() => setMenuOpen(true)} />
      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} />

      <Hero />

      <ServersBoard />

      <section
        id="daylight-news"
        aria-labelledby="daylight-news-title"
        className="grid scroll-mt-24 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-12"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <h5 id="daylight-news-title" className="font-display text-2xl font-bold tracking-tight">
            Новости
          </h5>
          <FeaturedNews item={featured} />
          <div className="grid gap-5 md:grid-cols-2">
            {restNews.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        </div>
        <aside className="flex min-w-0 flex-col gap-10">
          <div id="daylight-events" className="flex scroll-mt-24 flex-col gap-5">
            <h5 className="font-display text-2xl font-bold tracking-tight">События</h5>
            <EventCard event={laterEvent} />
          </div>
          <StoreAside />
        </aside>
      </section>

      <section
        id="daylight-profile"
        aria-labelledby="daylight-profile-title"
        className="grid scroll-mt-24 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-12"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <h5
            id="daylight-profile-title"
            className="font-display text-2xl font-bold tracking-tight"
          >
            Профиль игрока
          </h5>
          <ProfileCard user={profileUser} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <h5 className="font-display text-2xl font-bold tracking-tight">Уведомления</h5>
          <Card>
            <NotificationList items={demoNotifications} />
          </Card>
        </div>
      </section>
    </div>
  );
}
