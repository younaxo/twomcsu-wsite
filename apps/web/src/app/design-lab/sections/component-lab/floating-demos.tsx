'use client';

import {
  Ban,
  Bell,
  ChevronDown,
  Copy,
  Eye,
  Filter,
  Home,
  LogOut,
  Megaphone,
  Newspaper,
  Pencil,
  Plus,
  Search,
  Server,
  Settings,
  Shield,
  Store,
  Trash2,
  Users,
} from 'lucide-react';
import { useId, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckboxField } from '@/components/ui/checkbox';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  useCommandPalette,
} from '@/components/ui/command';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DynamicIsland } from '@/components/ui/dynamic-island';
import { Field, Label } from '@/components/ui/field';
import { FloatingDock, type FloatingDockItem } from '@/components/ui/floating-dock';
import { Hint, InlineHint } from '@/components/ui/hint';
import { UserHoverCard } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SwitchField } from '@/components/ui/switch';
import { snackbar, toast } from '@/components/ui/toast';
import { Toggletip } from '@/components/ui/toggletip';
import { HelpTooltip, RichTooltip, Tooltip, ValidationTooltip } from '@/components/ui/tooltip';
import { formatDate, formatNumber } from '@/lib/format';
import { demoServers, demoUsers } from '../../demo-data';
import { DemoBlock, DemoGrid, DemoResult, DemoRow, ROLE_NAMES, useTimers, wait } from './shared';

/// Группа «Floating»: подсказки, поповеры, меню, палитра, toast, dock, island.
export function FloatingDemos() {
  return (
    <DemoGrid>
      <TooltipDemo />
      <RichTooltipDemo />
      <ShortcutTooltipDemo />
      <HelpTooltipDemo />
      <ValidationTooltipDemo />
      <ToggletipDemo />
      <HintDemo />
      <PopoverDemo />
      <HoverCardDemo />
      <DropdownMenuDemo />
      <ContextMenuDemo />
      <CommandDemo />
      <ToastDemo />
      <FloatingDockDemo />
      <DynamicIslandDemo />
    </DemoGrid>
  );
}

/* ------------------------------------ Tooltip ------------------------------------ */

function TooltipDemo() {
  return (
    <DemoBlock
      title="Tooltip"
      use="Короткая подпись к иконке или сокращённому элементу; появляется по hover и по фокусу."
      avoid="важной информации — на touch нет hover. Для неё Toggletip или текст рядом."
    >
      <DemoRow>
        <Tooltip content="Удалить роль">
          <IconButton aria-label="Удалить роль" variant="outline">
            <Trash2 />
          </IconButton>
        </Tooltip>
        <Tooltip content="Скопировать UUID" side="bottom">
          <IconButton aria-label="Скопировать UUID" variant="outline">
            <Copy />
          </IconButton>
        </Tooltip>
        <Tooltip content="Подсказка справа от триггера" side="right">
          <Button variant="secondary">Справа</Button>
        </Tooltip>
      </DemoRow>
    </DemoBlock>
  );
}

function RichTooltipDemo() {
  const moderator = demoUsers[1];
  return (
    <DemoBlock
      title="RichTooltip"
      use="Заголовок + одна-две строки пояснения: роль, значение метрики, статус сервера."
      avoid="интерактива внутри (кнопки, ссылки) — tooltip не получает фокус; это Popover или HoverCard."
    >
      <DemoRow>
        <RichTooltip
          title={moderator.role}
          description="Может банить, мутить и редактировать новости. Приоритет 700."
        >
          <Button variant="outline" size="sm">
            <Shield />
            {moderator.role}
          </Button>
        </RichTooltip>
        <RichTooltip
          title="Онлайн 209"
          description="Суммарно по всем серверам, обновляется раз в 30 секунд."
          side="bottom"
        >
          <Button variant="ghost" size="sm">
            <StatusBadge status="online">209 онлайн</StatusBadge>
          </Button>
        </RichTooltip>
      </DemoRow>
    </DemoBlock>
  );
}

function ShortcutTooltipDemo() {
  return (
    <DemoBlock
      title="Tooltip с shortcut"
      use="У кнопок с горячими клавишами: подпись + сочетание в Kbd. Учит клавиатуре без справки."
      avoid="кнопок без сочетания — пустой Kbd вводит в заблуждение."
    >
      <DemoRow>
        <Tooltip content="Открыть палитру команд" shortcut={['Ctrl', 'K']}>
          <Button variant="secondary">
            <Search />
            Поиск
          </Button>
        </Tooltip>
        <Tooltip content="Сохранить изменения" shortcut={['Ctrl', 'S']}>
          <Button>Сохранить</Button>
        </Tooltip>
        <Tooltip content="Создать роль" shortcut={['C']}>
          <IconButton aria-label="Создать роль" variant="outline">
            <Plus />
          </IconButton>
        </Tooltip>
      </DemoRow>
    </DemoBlock>
  );
}

function HelpTooltipDemo() {
  return (
    <DemoBlock
      title="HelpTooltip"
      use="Иконка «?» у подписи поля или заголовка колонки: объясняет термин, не занимая место."
      avoid="обязательных правил заполнения — их пишут в hint под полем, а не прячут."
    >
      <Field
        label="Slug роли"
        hint="Например: senior-moderator"
        labelAddon={
          <HelpTooltip content="Латиница, цифры и дефис. Используется в URL и API; после создания изменить нельзя." />
        }
      >
        <Input placeholder="senior-moderator" autoComplete="off" />
      </Field>
    </DemoBlock>
  );
}

function ValidationTooltipDemo() {
  const [value, setValue] = useState('Steve Mainer');
  const errorId = useId();
  const error =
    value.trim() === ''
      ? 'Введите ник'
      : /\s/.test(value)
        ? 'Ник без пробелов'
        : value.length < 3
          ? 'Минимум 3 символа'
          : null;

  return (
    <DemoBlock
      title="ValidationTooltip"
      use="Ошибка у компактного поля (таблица, inline-редактирование), где нет места под текст."
      avoid="обычных форм — там ошибка выводится под полем через Field."
    >
      <DemoRow>
        <ValidationTooltip error={error}>
          <Input
            size="sm"
            aria-label="Ник игрока"
            aria-describedby={error ? errorId : undefined}
            invalid={error !== null}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            className="w-48"
          />
        </ValidationTooltip>
        <Button size="sm" variant="secondary" disabled={error !== null}>
          Сохранить
        </Button>
      </DemoRow>
      <span id={errorId} className="sr-only">
        {error}
      </span>
      <DemoResult>Уберите пробел из ника — подсказка исчезнет, кнопка станет доступна.</DemoResult>
    </DemoBlock>
  );
}

/* ----------------------------------- Toggletip ----------------------------------- */

function ToggletipDemo() {
  return (
    <DemoBlock
      title="Toggletip"
      use="Подсказка по нажатию: работает на touch и для информации, которую нельзя пропустить."
      avoid="действий внутри (кнопки, формы) — это Popover."
    >
      <DemoRow>
        <span className="text-sm">Лимит привата: 400 блоков</span>
        <Toggletip content="Лимит действует на сезон 7. Расширить можно через VIP или за игровую валюту." />
      </DemoRow>
      <DemoRow>
        <Toggletip
          side="bottom"
          align="start"
          content="Роль с большим приоритетом старше: её нельзя снять ролью с меньшим приоритетом."
        >
          <Button variant="link" size="sm">
            Что такое приоритет роли?
          </Button>
        </Toggletip>
      </DemoRow>
    </DemoBlock>
  );
}

/* ------------------------------------- Hint -------------------------------------- */

function HintDemo() {
  const hintId = useId();
  const inputId = useId();
  return (
    <DemoBlock
      title="Hint / InlineHint"
      use="Пояснение прямо в разметке: к фильтру, настройке, пустому списку. Видно всегда, без hover."
      avoid="длинных инструкций — они в документации или в Accordion."
    >
      <Hint>Фильтры применяются ко всем страницам списка.</Hint>
      <Hint tone="info">Онлайн обновляется раз в 30 секунд.</Hint>
      <Hint tone="warning">Бан без причины попадёт в аудит как нарушение регламента.</Hint>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>Причина бана</Label>
        <Input id={inputId} aria-describedby={hintId} placeholder="Читы на Survival #1" />
        <InlineHint id={hintId} tone="warning">
          Видна игроку и попадает в аудит.
        </InlineHint>
      </div>
    </DemoBlock>
  );
}

/* ------------------------------------ Popover ------------------------------------ */

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'online', label: 'Онлайн' },
  { value: 'offline', label: 'Офлайн' },
];

function PopoverDemo() {
  const [status, setStatus] = useState('all');
  const [bannedOnly, setBannedOnly] = useState(false);
  const [applied, setApplied] = useState<{ status: string; bannedOnly: boolean } | null>(null);

  const statusLabel = (value: string) =>
    STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;

  return (
    <DemoBlock
      title="Popover"
      use="Произвольный интерактивный контент по клику: мини-форма фильтра, выбор периода. Фокус уходит внутрь, Esc возвращает."
      avoid="списка действий (DropdownMenu) и подсказок (Toggletip)."
    >
      <DemoRow>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary">
              <Filter />
              Фильтры
              {applied ? <Badge tone="primary">1</Badge> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex flex-col gap-3">
            <p className="text-sm font-medium">Фильтр игроков</p>
            <Select value={status} onValueChange={setStatus}>
              <Field label="Статус">
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
              </Field>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CheckboxField
              label="Только забаненные"
              checked={bannedOnly}
              onCheckedChange={(checked) => setBannedOnly(checked === true)}
            />
            <div className="flex justify-end gap-2">
              <PopoverClose asChild>
                <Button size="sm" variant="ghost">
                  Отмена
                </Button>
              </PopoverClose>
              <PopoverClose asChild>
                <Button size="sm" onClick={() => setApplied({ status, bannedOnly })}>
                  Применить
                </Button>
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>
      </DemoRow>
      <DemoResult>
        {applied
          ? `Применено: статус — ${statusLabel(applied.status)}, ${applied.bannedOnly ? 'только забаненные' : 'все игроки'}`
          : 'Фильтр не применён'}
      </DemoResult>
    </DemoBlock>
  );
}

/* ----------------------------------- HoverCard ----------------------------------- */

function HoverCardDemo() {
  const author = demoUsers[1];
  const owner = demoUsers[3];
  return (
    <DemoBlock
      title="HoverCard / UserHoverCard"
      use="Превью профиля по наведению или фокусу на ник в новости, комментарии, логе."
      avoid="единственного пути к профилю — триггер обязан быть настоящей ссылкой."
    >
      <p className="text-sm leading-relaxed">
        Новость опубликовал{' '}
        <UserHoverCard
          username={author.username}
          tag={author.tag}
          role={author.role}
          roleColor={author.roleColor}
          online={author.online}
          avatar={author.avatar}
          description={`Наиграно ${formatNumber(author.playtimeHours)} ч · на сервере с ${formatDate(author.joinedAt)}`}
        >
          <a
            href="#lab"
            className="rounded-sm font-medium text-primary-soft-foreground underline-offset-4 hover:underline"
          >
            {author.username}
          </a>
        </UserHoverCard>
        , согласовал{' '}
        <UserHoverCard
          username={owner.username}
          tag={owner.tag}
          role={owner.role}
          roleColor={owner.roleColor}
          online={owner.online}
          avatar={owner.avatar}
          side="top"
          description={`Наиграно ${formatNumber(owner.playtimeHours)} ч`}
        >
          <a
            href="#lab"
            className="rounded-sm font-medium text-primary-soft-foreground underline-offset-4 hover:underline"
          >
            {owner.username}
          </a>
        </UserHoverCard>
        .
      </p>
    </DemoBlock>
  );
}

/* --------------------------------- DropdownMenu ---------------------------------- */

function DropdownMenuDemo() {
  const [showOffline, setShowOffline] = useState(true);
  const [last, setLast] = useState<string | null>(null);
  const target = demoUsers[1];

  return (
    <DemoBlock
      title="DropdownMenu"
      use="Список действий по кнопке: «…» в строке таблицы, меню профиля. Иконки, чекбокс-пункт, подменю, опасное действие."
      avoid="форм и фильтров (Popover); на узком экране список действий — ActionSheet."
    >
      <DemoRow>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              Действия
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{target.username}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setLast('Открыть профиль')}>
              <Eye />
              Открыть профиль
              <DropdownMenuShortcut keys={['Enter']} />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLast('Редактировать')}>
              <Pencil />
              Редактировать
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLast('Скопировать UUID')}>
              <Copy />
              Скопировать UUID
              <DropdownMenuShortcut keys={['Ctrl', 'C']} />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={showOffline} onCheckedChange={setShowOffline}>
              Показывать офлайн
            </DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Shield />
                Выдать роль
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {ROLE_NAMES.map((role) => (
                  <DropdownMenuItem key={role} onSelect={() => setLast(`Выдать роль: ${role}`)}>
                    {role}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setLast('Забанить')}>
              <Ban />
              Забанить
              <DropdownMenuShortcut keys={['Del']} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DemoRow>
      <DemoResult>
        {last ? `Выбрано: ${last}` : 'Ничего не выбрано'} · офлайн{' '}
        {showOffline ? 'показаны' : 'скрыты'}
      </DemoResult>
    </DemoBlock>
  );
}

/* ---------------------------------- ContextMenu ---------------------------------- */

function ContextMenuDemo() {
  const [last, setLast] = useState<string | null>(null);
  const user = demoUsers[2];

  return (
    <DemoBlock
      title="ContextMenu"
      use="Правый клик, long-press или Shift+F10 на карточке/строке: те же действия, что в DropdownMenu, у курсора."
      avoid="единственного способа добраться до действия — правый клик не обнаруживаем, дублируйте кнопкой."
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Card
            variant="sunken"
            tabIndex={0}
            aria-label={`Карточка игрока ${user.username}, контекстное меню`}
            className="flex select-none items-center gap-3 p-3"
          >
            <Avatar name={user.username} src={user.avatar} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.username}</p>
              <p className="truncate text-xs text-muted-foreground">{user.tag}</p>
            </div>
            <Badge color={user.roleColor}>{user.role}</Badge>
          </Card>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setLast('Открыть профиль')}>
            <Eye />
            Открыть профиль
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setLast('Скопировать ник')}>
            <Copy />
            Скопировать ник
            <ContextMenuShortcut keys={['Ctrl', 'C']} />
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setLast('Выдать роль')}>
            <Shield />
            Выдать роль
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => setLast('Забанить')}>
            <Ban />
            Забанить
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <DemoResult>{last ? `Выбрано: ${last}` : 'Вызовите меню на карточке'}</DemoResult>
    </DemoBlock>
  );
}

/* --------------------------------- CommandDialog --------------------------------- */

const PAGES = [
  { id: 'home', label: 'Главная', icon: <Home />, keys: ['G', 'H'] },
  { id: 'users', label: 'Пользователи', icon: <Users />, keys: ['G', 'U'] },
  { id: 'roles', label: 'Роли и права', icon: <Shield />, keys: ['G', 'R'] },
  { id: 'news', label: 'Новости', icon: <Newspaper />, keys: ['G', 'N'] },
  { id: 'store', label: 'Магазин', icon: <Store />, keys: ['G', 'S'] },
];

function CommandDemo() {
  const { open, setOpen } = useCommandPalette();
  const [last, setLast] = useState<string | null>(null);

  const run = (label: string) => {
    setLast(label);
    setOpen(false);
  };

  return (
    <DemoBlock
      title="CommandDialog"
      use="Палитра команд: переход по страницам, поиск игроков и серверов, действия. Кнопка и Ctrl/⌘ K через useCommandPalette."
      avoid="замены основной навигации — палитра дополняет её, а не прячет."
    >
      <DemoRow>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Search />
          Открыть палитру
        </Button>
        <span className="flex gap-0.5" aria-hidden>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </DemoRow>
      <DemoResult>{last ? `Выполнено: ${last}` : 'Команда не выбрана'}</DemoResult>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Страницы, игроки, сервера, действия…" />
        <CommandList>
          <CommandEmpty />
          <CommandGroup heading="Страницы">
            {PAGES.map((page) => (
              <CommandItem
                key={page.id}
                value={`page-${page.id}`}
                keywords={[page.label]}
                onSelect={() => run(`Перейти: ${page.label}`)}
              >
                {page.icon}
                {page.label}
                <CommandShortcut keys={page.keys} />
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Пользователи">
            {demoUsers.map((user) => (
              <CommandItem
                key={user.id}
                value={`user-${user.id}`}
                keywords={[user.username, user.tag, user.role]}
                onSelect={() => run(`Профиль: ${user.username}`)}
              >
                <Avatar name={user.username} src={user.avatar} size="xs" />
                {user.username}
                <span className="ml-auto text-xs text-muted-foreground">{user.role}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Сервера">
            {demoServers.map((server) => (
              <CommandItem
                key={server.id}
                value={`server-${server.id}`}
                keywords={[server.name, server.slug, server.version]}
                onSelect={() => run(`Сервер: ${server.name}`)}
              >
                <Server />
                {server.name}
                <span className="ml-auto text-xs text-muted-foreground tabular">
                  {server.online ? `${formatNumber(server.players)} онлайн` : 'офлайн'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Действия">
            <CommandItem
              value="action-create-role"
              keywords={['Создать роль', 'роль']}
              onSelect={() => run('Создать роль')}
            >
              <Plus />
              Создать роль
              <CommandShortcut keys={['C', 'R']} />
            </CommandItem>
            <CommandItem
              value="action-broadcast"
              keywords={['Разослать уведомление', 'уведомление']}
              onSelect={() => run('Разослать уведомление')}
            >
              <Megaphone />
              Разослать уведомление
            </CommandItem>
            <CommandItem
              value="action-logout"
              keywords={['Выйти', 'выход']}
              onSelect={() => run('Выйти из аккаунта')}
            >
              <LogOut />
              Выйти из аккаунта
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </DemoBlock>
  );
}

/* ------------------------------------- Toast ------------------------------------- */

function ToastDemo() {
  const { after } = useTimers();

  const showLoadingThenSuccess = () => {
    const id = toast.loading('Экспортируем игроков…');
    after(1500, () => {
      toast.success('Экспорт готов', { id, description: '18 420 строк, CSV' });
    });
  };

  const showPromise = () => {
    void toast.promise(
      wait(1500).then(() => 209),
      {
        loading: 'Пересчитываем онлайн…',
        success: (online) => `Онлайн сейчас: ${formatNumber(online)}`,
        error: 'Не удалось пересчитать онлайн',
      },
    );
  };

  return (
    <DemoBlock
      title="toast / snackbar"
      use="Короткое сообщение о результате действия. loading обновляется тем же id или через promise; snackbar — с действием «Отменить»."
      avoid="ошибок валидации (они у поля) и длинных текстов — для них Dialog или страница."
    >
      <DemoRow>
        <Button size="sm" variant="secondary" onClick={() => toast.success('Роль сохранена')}>
          Success
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast.error('Не удалось забанить игрока', {
              description: 'Сервер вернул 500. Повторите через минуту.',
            })
          }
        >
          Error
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => toast.warning('Сессия истекает через 5 минут')}
        >
          Warning
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => toast.info('Обновление 1.21 уже на сервере')}
        >
          Info
        </Button>
        <Button size="sm" variant="secondary" onClick={showLoadingThenSuccess}>
          Loading → success
        </Button>
        <Button size="sm" variant="secondary" onClick={showPromise}>
          Promise
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast.error('Сервер Anarchy недоступен', {
              persistent: true,
              description: 'Не закроется сам — нажмите крестик.',
            })
          }
        >
          Persistent
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            snackbar('Комментарий удалён', {
              action: {
                label: 'Отменить',
                onClick: () => toast.message('Комментарий восстановлен'),
              },
            })
          }
        >
          Snackbar
        </Button>
      </DemoRow>
    </DemoBlock>
  );
}

/* ---------------------------------- FloatingDock --------------------------------- */

function FloatingDockDemo() {
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState('home');

  const items: FloatingDockItem[] = [
    { id: 'home', label: 'Главная', icon: <Home /> },
    { id: 'users', label: 'Пользователи', icon: <Users />, badge: 3 },
    { id: 'notifications', label: 'Уведомления', icon: <Bell />, badge: 12 },
    { id: 'settings', label: 'Настройки', icon: <Settings /> },
    { id: 'logout', label: 'Выйти', icon: <LogOut />, disabled: true },
  ].map((item) => ({ ...item, active: item.id === active, onClick: () => setActive(item.id) }));

  return (
    <DemoBlock
      title="FloatingDock"
      use="Нижняя плавающая панель: mobile-навигация или 3–5 быстрых действий. Активный пункт — aria-current, подписи видны при hover/фокусе."
      avoid="основной десктопной навигации и списков длиннее пяти пунктов."
    >
      <SwitchField
        label="Показать док"
        description="Панель fixed внизу экрана — включайте только для проверки."
        checked={shown}
        onCheckedChange={setShown}
      />
      {shown ? <FloatingDock items={items} label="Быстрые действия (демо)" /> : null}
      <DemoResult>Активный пункт: {items.find((item) => item.active)?.label ?? '—'}</DemoResult>
    </DemoBlock>
  );
}

/* --------------------------------- DynamicIsland --------------------------------- */

type IslandPhase = 'idle' | 'loading' | 'success';

function DynamicIslandDemo() {
  const [phase, setPhase] = useState<IslandPhase>('idle');
  const [progress, setProgress] = useState(0);
  const { after, clearAll } = useTimers();

  const stop = () => {
    clearAll();
    setPhase('idle');
    setProgress(0);
  };

  const start = () => {
    clearAll();
    setPhase('loading');
    setProgress(0);
    const step = (value: number) => {
      if (value >= 100) {
        setProgress(100);
        setPhase('success');
        after(3000, stop);
        return;
      }
      setProgress(value);
      after(350, () => step(value + 12));
    };
    after(300, () => step(12));
  };

  return (
    <DemoBlock
      title="DynamicIsland"
      use="Статус одной фоновой операции с понятным концом: экспорт, массовый бан, перезапуск сервера. Один на экран."
      avoid="разовых сообщений (toast) и прогресса внутри формы (Progress)."
    >
      <DemoRow>
        <Button variant="secondary" onClick={start} disabled={phase === 'loading'}>
          Запустить фоновую операцию
        </Button>
        {phase !== 'idle' ? (
          <Button variant="ghost" onClick={stop}>
            Скрыть
          </Button>
        ) : null}
      </DemoRow>
      <DemoResult>
        {phase === 'idle'
          ? 'Операция не запущена'
          : phase === 'loading'
            ? `Экспорт: ${progress}%`
            : 'Экспорт завершён — остров скроется через 3 с'}
      </DemoResult>
      {phase !== 'idle' ? (
        <DynamicIsland
          status={phase === 'loading' ? 'loading' : 'success'}
          title={phase === 'loading' ? 'Экспортируем игроков…' : 'Экспорт завершён'}
          description={
            phase === 'loading'
              ? 'Собираем 18 420 строк в CSV. Можно продолжать работу.'
              : 'Файл users.csv готов к скачиванию.'
          }
          progress={phase === 'loading' ? progress : undefined}
          action={
            phase === 'loading' ? (
              <Button size="sm" variant="ghost" onClick={stop}>
                Отменить
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={stop}>
                Скачать файл
              </Button>
            )
          }
          onDismiss={stop}
        />
      ) : null}
    </DemoBlock>
  );
}
