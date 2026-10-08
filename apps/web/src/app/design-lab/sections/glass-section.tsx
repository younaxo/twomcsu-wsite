'use client';

import {
  Bell,
  Copy,
  Home,
  Loader2,
  MessageSquare,
  Pencil,
  Search,
  Settings,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  menuItemClassName,
  menuLabelClassName,
  menuSeparatorClassName,
  menuShortcutClassName,
} from '@/components/ui/dropdown-menu';
import { DynamicIsland } from '@/components/ui/dynamic-island';
import { FloatingDock } from '@/components/ui/floating-dock';
import { FloatingPanel } from '@/components/ui/floating-panel';
import { GlassSurface, type GlassMaterial } from '@/components/ui/glass';
import { Kbd } from '@/components/ui/kbd';
import { QuickView } from '@/components/ui/quick-view';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/cn';
import { GLASS_ATTRIBUTE, type GlassMode } from '@/lib/theme/glass';
import { useTheme } from '@/lib/theme/theme-provider';
import { demoUsers } from '../demo-data';

/// GLASS MATERIALS — production-секция /design-lab: Frosted и Liquid Glass
/// «Полдня» на тёмной и светлой теме, в состояниях hover/active/focus и в
/// fallback. Образцы — статичные копии реальных overlay-поверхностей на
/// «живом» фоне (контент, оранжевый свет), чтобы было видно размытие,
/// кромку и преломление. Реальные компоненты открываются кнопками ниже.

type SpecimenState = 'default' | 'hover' | 'active' | 'focus' | 'fallback';

const STATE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'hover', label: 'Hover' },
  { value: 'active', label: 'Active' },
  { value: 'focus', label: 'Focus' },
  { value: 'fallback', label: 'Reduced motion / fallback' },
];

const MODE_OPTIONS = [
  { value: 'auto', label: 'Авто' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'frosted', label: 'Frosted' },
  { value: 'solid', label: 'Solid' },
];

const MODE_HINT: Record<GlassMode, string> = {
  liquid:
    'Chromium, мышь, ≥ 4 ГБ, без reduced-motion: frosted + преломление на liquid-поверхностях.',
  frosted:
    'Blur + saturate без преломления: Safari/Firefox, touch-устройства, prefers-reduced-motion, слабая память.',
  solid:
    'Плотная поверхность без прозрачности: нет backdrop-filter, prefers-reduced-transparency или Save-Data.',
};

function stateClassName(state: SpecimenState): string {
  switch (state) {
    case 'hover':
    case 'active':
      return 'glass-active';
    case 'focus':
      return 'outline outline-2 outline-offset-2 outline-focus-ring';
    case 'fallback':
      return 'glass-fallback';
    default:
      return '';
  }
}

export function GlassSection() {
  const { glass } = useTheme();
  const [state, setState] = useState<SpecimenState>('default');
  const [mode, setMode] = useState<'auto' | GlassMode>('auto');

  // Принудительный режим — только пока открыт раздел; при уходе провайдер
  // снова определяет режим сам (атрибут восстанавливается).
  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'auto') {
      if (glass) root.setAttribute(GLASS_ATTRIBUTE, glass);
      return;
    }
    root.setAttribute(GLASS_ATTRIBUTE, mode);
    return () => {
      if (glass) root.setAttribute(GLASS_ATTRIBUTE, glass);
    };
  }, [mode, glass]);

  const effectiveMode: GlassMode | null = mode === 'auto' ? glass : mode;

  return (
    <div className="flex flex-col gap-10">
      <Card variant="flat" className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Режим стекла на этом устройстве</p>
            <SegmentedControl
              aria-label="Режим стекла"
              options={MODE_OPTIONS}
              value={mode}
              onValueChange={(value) => setMode(value as 'auto' | GlassMode)}
            />
            <p className="text-xs text-muted-foreground">
              Определено автоматически:{' '}
              <span className="font-mono text-foreground">{glass ?? '…'}</span>.{' '}
              {effectiveMode ? MODE_HINT[effectiveMode] : null}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Состояние образцов</p>
            <SegmentedControl
              aria-label="Состояние образцов"
              options={STATE_OPTIONS}
              value={state}
              onValueChange={(value) => setState(value as SpecimenState)}
            />
            <p className="text-xs text-muted-foreground">
              Hover/Active сдвигают блик liquid-поверхности; Fallback показывает плотный
              solid-вариант, который получают prefers-reduced-transparency и браузеры без
              backdrop-filter.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <ThemePane theme="dark" state={state} />
        <ThemePane theme="light" state={state} />
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-xl">Solid · Frosted · Liquid — где какой материал оправдан</h3>
        <ComparisonGrid state={state} />
      </div>

      <LiveOverlays />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ThemePane({ theme, state }: { theme: 'dark' | 'light'; state: SpecimenState }) {
  return (
    <section
      data-theme={theme}
      aria-label={theme === 'dark' ? 'Тёмная тема' : 'Светлая тема'}
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-background p-4 text-foreground sm:p-6"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">
          {theme === 'dark' ? 'Тёмная (основная)' : 'Светлая'}
        </h3>
        <Badge tone={theme === 'dark' ? 'primary' : 'neutral'}>
          data-theme=&quot;{theme}&quot;
        </Badge>
      </div>

      <h4 className="text-sm font-medium text-muted-foreground">Frosted Glass</h4>
      <Backdrop>
        <div className="grid gap-4 sm:grid-cols-2">
          <Specimen label="Tooltip">
            <GlassSurface
              material="frosted-strong"
              className={cn('w-max rounded-sm px-2.5 py-1.5 text-xs', stateClassName(state))}
            >
              Забанить игрока · <Kbd>B</Kbd>
            </GlassSurface>
          </Specimen>
          <Specimen label="Popover">
            <GlassSurface material="frosted" className={cn('w-64 p-4', stateClassName(state))}>
              <p className="text-sm font-medium">Выдать награду</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Игрок получит уведомление и запись в профиле.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm">Выдать</Button>
                <Button size="sm" variant="ghost">
                  Отмена
                </Button>
              </div>
            </GlassSurface>
          </Specimen>
          <Specimen label="Dropdown">
            <MenuSpecimen state={state} />
          </Specimen>
          <Specimen label="Context menu">
            <MenuSpecimen state={state} context />
          </Specimen>
          <Specimen label="Modal" span>
            <GlassSurface
              material="frosted-strong"
              className={cn('w-full max-w-md', stateClassName(state))}
            >
              <div className="flex flex-col gap-1 px-5 pt-5">
                <p className="text-lg font-semibold">Снять роль «Модератор»?</p>
                <p className="text-sm text-muted-foreground">
                  Права исчезнут сразу. Запись попадёт в журнал аудита.
                </p>
              </div>
              <div className="flex justify-end gap-2 px-5 pb-5 pt-4">
                <Button variant="ghost">Отмена</Button>
                <Button variant="destructive">Снять роль</Button>
              </div>
            </GlassSurface>
          </Specimen>
          <Specimen label="Command palette" span>
            <GlassSurface
              material="frosted-strong"
              className={cn('w-full max-w-lg overflow-hidden', stateClassName(state))}
            >
              <div className="flex h-control items-center gap-2 border-b border-border-subtle px-3">
                <Search aria-hidden className="size-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Игрок, страница или действие…</span>
                <span className={cn(menuShortcutClassName, 'ml-auto')}>
                  <Kbd>Esc</Kbd>
                </span>
              </div>
              <div className="p-1">
                <p className={menuLabelClassName}>Игроки</p>
                {demoUsers.slice(0, 2).map((user) => (
                  <div key={user.id} className={menuItemClassName}>
                    <Avatar size="xs" name={user.username} src={user.avatar} />
                    {user.username}
                    <span className="ml-auto text-xs text-subtle-foreground">{user.role}</span>
                  </div>
                ))}
                <p className={menuLabelClassName}>Действия</p>
                <div className={cn(menuItemClassName, 'bg-muted')}>
                  <Shield />
                  Выдать роль…
                  <span className={menuShortcutClassName}>
                    <Kbd>⌘</Kbd>
                    <Kbd>R</Kbd>
                  </span>
                </div>
              </div>
            </GlassSurface>
          </Specimen>
        </div>
      </Backdrop>

      <h4 className="text-sm font-medium text-muted-foreground">Liquid Glass</h4>
      <Backdrop>
        <div className="grid gap-4 sm:grid-cols-2">
          <Specimen label="Floating Dock" span>
            <FloatingDock
              label="Dock (образец)"
              className={cn('static translate-x-0', stateClassName(state))}
              items={[
                { id: 'home', label: 'Главная', icon: <Home />, active: true },
                { id: 'players', label: 'Игроки', icon: <Users /> },
                { id: 'chat', label: 'Чат', icon: <MessageSquare />, badge: 3 },
                { id: 'alerts', label: 'Уведомления', icon: <Bell /> },
                { id: 'settings', label: 'Настройки', icon: <Settings /> },
              ]}
            />
          </Specimen>
          <Specimen label="Dynamic Island">
            <GlassSurface
              material="liquid"
              className={cn(
                'flex h-control w-max max-w-full items-center gap-2 px-3 text-sm',
                stateClassName(state),
              )}
            >
              <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
              Экспорт игроков · 68%
            </GlassSurface>
          </Specimen>
          <Specimen label="Floating Panel">
            <GlassSurface
              material="liquid"
              className={cn('w-full max-w-xs', stateClassName(state))}
            >
              <div className="flex h-control items-center gap-2 border-b border-border-subtle pl-4 pr-2 text-sm font-medium">
                <Shield aria-hidden className="size-4 text-muted-foreground" />
                Массовый бан
              </div>
              <div className="flex flex-col gap-2 p-4 text-sm">
                <p className="text-muted-foreground">12 из 40 аккаунтов обработано</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[30%] rounded-full bg-primary" />
                </div>
              </div>
            </GlassSurface>
          </Specimen>
          <Specimen label="Premium action surface" span>
            <GlassSurface
              material="liquid"
              className={cn(
                'flex w-full max-w-md flex-wrap items-center gap-3 p-3',
                stateClassName(state),
              )}
            >
              <AvatarStack
                users={demoUsers
                  .slice(0, 4)
                  .map((user) => ({ id: user.id, name: user.username, src: user.avatar }))}
                size="sm"
                max={4}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Сейчас на сервере</p>
                <p className="text-xs text-muted-foreground">Выживание · 148 игроков</p>
              </div>
              <Button size="sm">Играть</Button>
            </GlassSurface>
          </Specimen>
        </div>
      </Backdrop>
    </section>
  );
}

function MenuSpecimen({ state, context = false }: { state: SpecimenState; context?: boolean }) {
  return (
    <GlassSurface material="frosted" className={cn('w-56 p-1', stateClassName(state))}>
      {context ? <p className={menuLabelClassName}>Steve_Builder</p> : null}
      <div className={cn(menuItemClassName, 'bg-muted')}>
        <Pencil />
        Редактировать
        <span className={menuShortcutClassName}>
          <Kbd>E</Kbd>
        </span>
      </div>
      <div className={menuItemClassName}>
        <Copy />
        Копировать ник
      </div>
      <div className={menuSeparatorClassName} />
      <div className={cn(menuItemClassName, 'text-destructive')}>
        <Trash2 />
        Забанить…
      </div>
    </GlassSurface>
  );
}

/* ------------------------------------------------------------------ */

function ComparisonGrid({ state }: { state: SpecimenState }) {
  const items: { material: GlassMaterial | 'solid'; title: string; use: string; avoid: string }[] =
    [
      {
        material: 'solid',
        title: 'Solid',
        use: 'Контент страницы: карточки, таблицы, формы, сайдбар админки — всё, что читают долго.',
        avoid: 'Не для плавающих слоёв над контентом — без глубины они «прилипают» к странице.',
      },
      {
        material: 'frosted',
        title: 'Frosted',
        use: 'Любой overlay с текстом: меню, popover, модальные окна, палитра, toast.',
        avoid: 'Не для карточек в потоке страницы: десятки backdrop-filter в скролле.',
      },
      {
        material: 'liquid',
        title: 'Liquid',
        use: 'Один-два премиальных плавающих контрола на экран: dock, dynamic island, панель.',
        avoid:
          'Не для текста длиннее двух строк и не для элементов, которых на экране больше двух.',
      },
    ];
  return (
    <Backdrop>
      <div className="grid gap-4 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.material} className="flex flex-col gap-3">
            {item.material === 'solid' ? (
              <Card className={cn('flex flex-col gap-2', stateClassName(state))}>
                <ComparisonContent />
              </Card>
            ) : (
              <GlassSurface
                material={item.material}
                className={cn('flex flex-col gap-2 p-card-p', stateClassName(state))}
              >
                <ComparisonContent />
              </GlassSurface>
            )}
            <div className="rounded-lg bg-background/80 p-3 text-xs">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-muted-foreground">
                <span className="font-medium text-foreground">Где: </span>
                {item.use}
              </p>
              <p className="mt-1 text-muted-foreground">
                <span className="font-medium text-foreground">Не: </span>
                {item.avoid}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Backdrop>
  );
}

function ComparisonContent() {
  const user = demoUsers[0]!;
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar size="md" name={user.username} src={user.avatar} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{user.username}</p>
          <p className="text-xs text-muted-foreground">{user.role}</p>
        </div>
        <StatusBadge status="online" className="ml-auto" />
      </div>
      <p className="text-sm text-muted-foreground">
        Одна и та же карточка игрока на трёх материалах — сравнивайте читаемость и глубину.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary">
          Профиль
        </Button>
        <IconButton aria-label="Ещё" size="sm">
          <Settings />
        </IconButton>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

/// «Живой» фон под образцами: контент, оранжевый свет, полосы текста —
/// чтобы blur/преломление/кромка были видны. Только CSS, без картинок.
function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-lg border bg-background-subtle p-4 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
        <div className="absolute -left-10 -top-16 size-72 rounded-full bg-primary/35 blur-3xl" />
        <div className="absolute -bottom-20 right-0 size-80 rounded-full bg-info/25 blur-3xl" />
        <div className="absolute inset-x-6 top-6 flex flex-col gap-3 opacity-80">
          <div className="h-5 w-2/3 rounded bg-foreground/80" />
          <div className="h-3 w-full rounded bg-foreground/35" />
          <div className="h-3 w-5/6 rounded bg-foreground/35" />
          <div className="mt-2 flex gap-2">
            {demoUsers.slice(0, 6).map((user) => (
              <Avatar key={user.id} size="sm" name={user.username} src={user.avatar} />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="h-16 rounded bg-primary/70" />
            <div className="h-16 rounded bg-foreground/20" />
            <div className="h-16 rounded bg-success/50" />
          </div>
          <div className="h-3 w-3/4 rounded bg-foreground/35" />
          <div className="h-3 w-1/2 rounded bg-foreground/35" />
        </div>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function Specimen({
  label,
  span,
  children,
}: {
  label: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', span && 'sm:col-span-2')}>
      <p className="w-max rounded-sm bg-background/80 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/// Реальные overlay-компоненты поверх страницы — проверка материала в
/// боевом положении (портал, z-index, scroll-lock, клавиатура).
function LiveOverlays() {
  const [dialog, setDialog] = useState(false);
  const [command, setCommand] = useState(false);
  const [island, setIsland] = useState(false);
  const [panel, setPanel] = useState(false);
  const [quick, setQuick] = useState(false);
  const user = demoUsers[1]!;

  return (
    <Card variant="flat" className="flex flex-col gap-3">
      <p className="text-sm font-medium">Живые overlay на этой странице</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setDialog(true)}>
          Modal
        </Button>
        <Button variant="secondary" onClick={() => setCommand(true)}>
          Command palette
        </Button>
        <Button variant="secondary" onClick={() => setIsland((value) => !value)}>
          {island ? 'Скрыть Dynamic Island' : 'Dynamic Island'}
        </Button>
        <Button variant="secondary" onClick={() => setPanel((value) => !value)}>
          {panel ? 'Скрыть Floating Panel' : 'Floating Panel'}
        </Button>
        <Button variant="secondary" onClick={() => setQuick(true)}>
          Quick View
        </Button>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Frosted Glass · Modal</DialogTitle>
            <DialogDescription>
              Плотный frosted-strong: длинный текст должен читаться на любом фоне.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              Прокрутите страницу за окном — scroll-lock, фон не двигается. Esc закрывает, фокус
              возвращается на кнопку.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Закрыть
            </Button>
            <Button onClick={() => setDialog(false)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CommandDialog open={command} onOpenChange={setCommand}>
        <CommandInput placeholder="Игрок, страница или действие…" />
        <CommandList>
          <CommandEmpty>Ничего не найдено</CommandEmpty>
          <CommandGroup heading="Игроки">
            {demoUsers.slice(0, 4).map((player) => (
              <CommandItem
                key={player.id}
                value={player.username}
                onSelect={() => setCommand(false)}
              >
                <Avatar size="xs" name={player.username} src={player.avatar} />
                {player.username}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Действия">
            <CommandItem value="role" onSelect={() => setCommand(false)}>
              <Shield />
              Выдать роль…
              <CommandShortcut keys={['⌘', 'R']} />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {island ? (
        <DynamicIsland
          status="loading"
          title="Экспорт игроков · 68%"
          description="CSV, 12 400 строк — около минуты."
          progress={68}
          onDismiss={() => setIsland(false)}
        />
      ) : null}

      <FloatingPanel
        open={panel}
        onOpenChange={setPanel}
        title="Массовый бан"
        icon={<Shield />}
        footer={
          <Button size="sm" variant="ghost" onClick={() => setPanel(false)}>
            Отменить
          </Button>
        }
      >
        <div className="flex flex-col gap-2 p-4 text-sm">
          <p className="text-muted-foreground">12 из 40 аккаунтов обработано</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[30%] rounded-full bg-primary" />
          </div>
        </div>
      </FloatingPanel>

      <QuickView
        open={quick}
        onOpenChange={setQuick}
        title={user.username}
        subtitle={`${user.role} · в игре ${user.playtimeHours} ч`}
        meta={<StatusBadge status={user.online ? 'online' : 'offline'} />}
        actions={<Button onClick={() => setQuick(false)}>Готово</Button>}
      >
        <p className="text-sm text-muted-foreground">
          Quick View — liquid поверх frosted-strong: премиальная поверхность для одного объекта, на
          mobile превращается в нижний Drawer.
        </p>
      </QuickView>
    </Card>
  );
}
