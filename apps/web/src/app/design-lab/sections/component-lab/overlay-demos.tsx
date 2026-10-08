'use client';

import {
  Ban,
  Eye,
  Home,
  Mail,
  MoreHorizontal,
  Newspaper,
  PanelBottom,
  PanelLeft,
  Plus,
  Settings,
  Shield,
  ShieldBan,
  SlidersHorizontal,
  Store,
  Users,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import { ColorPicker } from '@/components/ui/color-picker';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ActionSheet,
  BottomSheet,
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { FloatingPanel } from '@/components/ui/floating-panel';
import { Input, Textarea } from '@/components/ui/input';
import { Lightbox, type LightboxImage } from '@/components/ui/lightbox';
import { Progress } from '@/components/ui/progress';
import { QuickView } from '@/components/ui/quick-view';
import { RadioCards } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { NumberStepper } from '@/components/ui/stepper';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { Wizard, type WizardStep } from '@/components/ui/wizard';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { demoAudit, demoNews, demoProducts, demoServers, demoUsers } from '../../demo-data';
import {
  DemoBlock,
  DemoGrid,
  DemoResult,
  DemoRow,
  ROLE_COLOR_LABELS,
  ROLE_COLORS,
  wait,
} from './shared';

/// Группа «Overlays»: модальные окна, панели, листы, просмотр, мастер.
export function OverlayDemos() {
  return (
    <DemoGrid>
      <DialogDemo />
      <ConfirmDialogDemo />
      <SheetDemo />
      <DrawerDemo />
      <ActionSheetDemo />
      <QuickViewDemo />
      <FloatingPanelDemo />
      <LightboxDemo />
      <WizardDemo />
    </DemoGrid>
  );
}

/* ------------------------------------ Dialog ------------------------------------- */

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function DialogDemo() {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [priority, setPriority] = useState(100);
  const [color, setColor] = useState<string | null>(ROLE_COLORS[0] ?? null);
  const [assignable, setAssignable] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const nameError =
    submitted && name.trim().length < 2 ? 'Укажите название — минимум 2 символа' : null;
  const slugError = submitted && !SLUG_PATTERN.test(slug) ? 'Только латиница, цифры и дефис' : null;

  const reset = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setPriority(100);
    setColor(ROLE_COLORS[0] ?? null);
    setAssignable(true);
    setSubmitted(false);
  };

  const submit = () => {
    setSubmitted(true);
    const valid = name.trim().length >= 2 && SLUG_PATTERN.test(slug);
    if (!valid) {
      return;
    }
    toast.success(`Роль «${name.trim()}» создана`, {
      description: `slug ${slug}, приоритет ${priority}${assignable ? ', можно выдавать' : ''}`,
    });
    setCreated(name.trim());
    setOpen(false);
    reset();
  };

  return (
    <DemoBlock
      title="Dialog"
      use="Форма или детали в модальном окне: создание роли, редактирование. Esc и клик по подложке закрывают, фокус возвращается на кнопку."
      avoid="подтверждения опасных действий (ConfirmDialog) и длинных форм (Sheet или отдельная страница)."
    >
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            reset();
          }
        }}
      >
        <DialogTrigger asChild>
          <Button>
            <Plus />
            Новая роль
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая роль</DialogTitle>
            <DialogDescription>Права настраиваются после создания.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form
              id={formId}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              className="flex flex-col gap-4"
            >
              <Field label="Название" required error={nameError}>
                <Input
                  value={name}
                  autoComplete="off"
                  placeholder="Senior Moderator"
                  onChange={(event) => {
                    setName(event.target.value);
                    if (!slugTouched) {
                      setSlug(slugify(event.target.value));
                    }
                  }}
                />
              </Field>
              <Field
                label="Slug"
                required
                hint="Используется в URL и API; латиница, цифры, дефис"
                error={slugError}
              >
                <Input
                  value={slug}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="senior-moderator"
                  className="font-mono"
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value);
                  }}
                />
              </Field>
              <Field label="Приоритет" hint="Чем выше, тем старше роль в иерархии">
                <NumberStepper
                  value={priority}
                  onValueChange={setPriority}
                  min={0}
                  max={1000}
                  step={10}
                />
              </Field>
              <Field label="Цвет" hint="Готовые цвета — из существующих ролей">
                <ColorPicker
                  value={color}
                  onChange={setColor}
                  presets={ROLE_COLORS}
                  presetLabels={ROLE_COLOR_LABELS}
                />
              </Field>
              <SwitchField
                label="Можно выдавать"
                description="Модераторы смогут назначать роль игрокам"
                checked={assignable}
                onCheckedChange={setAssignable}
              />
            </form>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Отмена</Button>
            </DialogClose>
            <Button type="submit" form={formId}>
              Создать роль
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DemoResult>
        {created ? `Последняя созданная роль: ${created}` : 'Роли ещё не создавались'}
      </DemoResult>
    </DemoBlock>
  );
}

/* --------------------------------- ConfirmDialog --------------------------------- */

function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [banned, setBanned] = useState(false);
  const target = demoUsers[7];

  return (
    <DemoBlock
      title="ConfirmDialog"
      use="Подтверждение необратимого действия: бан, удаление роли. Фокус на «Отмена», подложка не закрывает; пока идёт запрос — кнопки заблокированы."
      avoid="обычных форм и действий, которые легко отменить."
    >
      <DemoRow>
        <Button variant="destructive-outline" onClick={() => setOpen(true)} disabled={banned}>
          <Ban />
          Забанить пользователя
        </Button>
        {banned ? (
          <Button variant="ghost" onClick={() => setBanned(false)}>
            Снять бан
          </Button>
        ) : null}
      </DemoRow>
      <DemoResult>
        {target.username}: {banned ? 'забанен' : 'активен'}
      </DemoResult>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setReason('');
            setError(null);
          }
        }}
        title={`Забанить ${target.username}?`}
        description="Игрок потеряет доступ ко всем серверам. Бан можно снять в профиле."
        confirmLabel="Забанить"
        destructive
        onConfirm={() => {
          if (reason.trim().length < 5) {
            setError('Укажите причину — минимум 5 символов');
            return undefined;
          }
          setError(null);
          return wait(1200).then(() => {
            setBanned(true);
            toast.success(`${target.username} забанен`, { description: reason.trim() });
          });
        }}
      >
        <Field label="Причина" required error={error} hint="Видна игроку и попадает в аудит">
          <Textarea
            rows={3}
            value={reason}
            placeholder="Читы на Survival #1"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </DemoBlock>
  );
}

/* ------------------------------------- Sheet ------------------------------------- */

const ADMIN_NAV: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Обзор', icon: <Home /> },
  { id: 'users', label: 'Пользователи', icon: <Users /> },
  { id: 'roles', label: 'Роли и права', icon: <Shield /> },
  { id: 'news', label: 'Новости', icon: <Newspaper /> },
  { id: 'store', label: 'Магазин', icon: <Store /> },
  { id: 'settings', label: 'Настройки', icon: <Settings /> },
];

function SheetDemo() {
  const [server, setServer] = useState(demoServers[0].slug);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [hours, setHours] = useState([100]);
  const [result, setResult] = useState<string | null>(null);

  const reset = () => {
    setServer(demoServers[0].slug);
    setOnlineOnly(false);
    setHours([100]);
  };

  const apply = () => {
    const name = demoServers.find((item) => item.slug === server)?.name ?? server;
    setResult(
      `Фильтры: ${name}, ${onlineOnly ? 'только онлайн' : 'все'}, от ${formatNumber(hours[0] ?? 0)} ч`,
    );
  };

  return (
    <DemoBlock
      title="Sheet"
      use="Боковая панель: фильтры рядом с таблицей (справа), навигация (слева), карточка объекта. На < 640px — во весь экран."
      avoid="коротких подтверждений (Dialog) и мобильных жестов (Drawer/BottomSheet)."
    >
      <DemoRow>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary">
              <SlidersHorizontal />
              Фильтры (справа)
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Фильтры</SheetTitle>
              <SheetDescription>Применяются ко всему списку игроков.</SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-4">
              <Select value={server} onValueChange={setServer}>
                <Field label="Сервер">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </Field>
                <SelectContent>
                  {demoServers.map((item) => (
                    <SelectItem key={item.id} value={item.slug}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CheckboxField
                label="Только онлайн"
                description="Скрыть игроков, которых нет на сервере"
                checked={onlineOnly}
                onCheckedChange={(checked) => setOnlineOnly(checked === true)}
              />
              <Field label={`Наиграно от ${formatNumber(hours[0] ?? 0)} ч`}>
                <Slider
                  value={hours}
                  onValueChange={setHours}
                  min={0}
                  max={1000}
                  step={50}
                  showValue
                  thumbLabel="Минимум наигранных часов"
                  formatValue={(value) => `${value} ч`}
                />
              </Field>
            </SheetBody>
            <SheetFooter>
              <Button variant="ghost" onClick={reset}>
                Сбросить
              </Button>
              <SheetClose asChild>
                <Button onClick={apply}>Применить</Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary">
              <PanelLeft />
              Навигация (слева)
            </Button>
          </SheetTrigger>
          <SheetContent side="left" size="sm">
            <SheetHeader>
              <SheetTitle>Админка</SheetTitle>
              <SheetDescription>Разделы панели управления.</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <nav aria-label="Разделы админки">
                <ul className="flex flex-col gap-0.5">
                  {ADMIN_NAV.map((item) => (
                    <li key={item.id}>
                      <SheetClose asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => setResult(`Переход: ${item.label}`)}
                        >
                          {item.icon}
                          {item.label}
                        </Button>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </nav>
            </SheetBody>
          </SheetContent>
        </Sheet>
      </DemoRow>
      <DemoResult>{result ?? 'Фильтры не применены'}</DemoResult>
    </DemoBlock>
  );
}

/* ------------------------------- Drawer / BottomSheet ---------------------------- */

function DrawerDemo() {
  const server = demoServers[0];
  const [joined, setJoined] = useState(false);

  return (
    <DemoBlock
      title="Drawer / BottomSheet"
      use="Нижняя панель с жестами (vaul): mobile-замена dialog и dropdown. BottomSheet добавляет snap-точки для длинных списков."
      avoid="десктопных форм — там Dialog или Sheet."
    >
      <DemoRow>
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="secondary">
              <PanelBottom />
              Карточка сервера
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{server.name}</DrawerTitle>
              <DrawerDescription>{server.motd}</DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Версия</dt>
                <dd className="font-mono text-xs">{server.version}</dd>
                <dt className="text-muted-foreground">Онлайн</dt>
                <dd className="tabular">
                  {formatNumber(server.players)} / {formatNumber(server.maxPlayers)}
                </dd>
                <dt className="text-muted-foreground">Пинг</dt>
                <dd className="tabular">{server.pingMs === null ? '—' : `${server.pingMs} мс`}</dd>
                <dt className="text-muted-foreground">Статус</dt>
                <dd>
                  <StatusBadge status={server.online ? 'online' : 'offline'} />
                </dd>
              </dl>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button size="lg" onClick={() => setJoined(true)}>
                  Подключиться
                </Button>
              </DrawerClose>
              <DrawerClose asChild>
                <Button size="lg" variant="ghost">
                  Закрыть
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <BottomSheet snapPoints={[0.45, 1]}>
          <DrawerTrigger asChild>
            <Button variant="secondary">
              <Newspaper />
              Новости (snap)
            </Button>
          </DrawerTrigger>
          <DrawerContent className="h-[85dvh]">
            <DrawerHeader>
              <DrawerTitle>Новости</DrawerTitle>
              <DrawerDescription>Потяните вверх, чтобы раскрыть на весь экран.</DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <ul className="flex flex-col divide-y divide-border-subtle">
                {demoNews.map((item) => (
                  <li key={item.id} className="py-3">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.excerpt}</p>
                    <p className="mt-1 text-xs text-subtle-foreground tabular">
                      {item.author} · {formatDate(item.publishedAt)} · комментариев:{' '}
                      {formatNumber(item.comments)}
                    </p>
                  </li>
                ))}
              </ul>
            </DrawerBody>
          </DrawerContent>
        </BottomSheet>
      </DemoRow>
      <DemoResult>
        {joined ? `Подключение к ${server.name} отправлено` : 'Подключение не запрошено'}
      </DemoResult>
    </DemoBlock>
  );
}

/* ---------------------------------- ActionSheet ---------------------------------- */

function ActionSheetDemo() {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const user = demoUsers[2];

  return (
    <DemoBlock
      title="ActionSheet"
      use="Список действий во всю ширину снизу — touch-замена DropdownMenu и ContextMenu. Закрывается после выбора."
      avoid="десктопа с мышью — там DropdownMenu у кнопки."
    >
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <MoreHorizontal />
        Действия с игроком
      </Button>
      <DemoResult>{last ? `Выбрано: ${last}` : 'Действие не выбрано'}</DemoResult>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        title={user.username}
        description={`${user.role} · ${user.online ? 'онлайн' : 'офлайн'}`}
        actions={[
          { label: 'Открыть профиль', icon: <Eye />, onSelect: () => setLast('Открыть профиль') },
          { label: 'Написать', icon: <Mail />, onSelect: () => setLast('Написать') },
          { label: 'Выдать роль', icon: <Shield />, onSelect: () => setLast('Выдать роль') },
          {
            label: 'Забанить',
            icon: <Ban />,
            destructive: true,
            onSelect: () => setLast('Забанить'),
          },
        ]}
      />
    </DemoBlock>
  );
}

/* ----------------------------------- QuickView ----------------------------------- */

function QuickViewDemo() {
  const [open, setOpen] = useState(false);
  const user = demoUsers[3];
  const actions = demoAudit.filter((entry) => entry.actor === user.username);

  return (
    <DemoBlock
      title="QuickView"
      use="Быстрый просмотр объекта из списка без перехода: на desktop — Dialog lg, на mobile — нижний Drawer. Ссылка на полную страницу в футере."
      avoid="редактирования — для него Dialog с формой или страница."
    >
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Eye />
        Открыть {user.username}
      </Button>
      <QuickView
        open={open}
        onOpenChange={setOpen}
        title={user.username}
        subtitle={`${user.role} · на сервере с ${formatDate(user.joinedAt)}`}
        meta={
          <>
            <StatusBadge status={user.online ? 'online' : 'offline'} />
            <Badge color={user.roleColor}>{user.role}</Badge>
          </>
        }
        href="#lab"
        hrefLabel="Открыть профиль"
        actions={
          <>
            <Button variant="secondary" onClick={() => toast.info(`Сообщение ${user.username}`)}>
              <Mail />
              Написать
            </Button>
            <Button
              variant="destructive-outline"
              onClick={() => toast.warning('Бан владельца невозможен')}
            >
              <Ban />
              Забанить
            </Button>
          </>
        }
        aside={
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Последние действия</p>
            {actions.length > 0 ? (
              <ul className="flex flex-col gap-2 text-sm">
                {actions.map((entry) => (
                  <li key={entry.id}>
                    <p className="font-mono text-xs">{entry.action}</p>
                    <p className="text-xs text-subtle-foreground">{formatDate(entry.at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Действий пока нет.</p>
            )}
          </div>
        }
      >
        <div className="flex items-start gap-4">
          <Avatar name={user.username} src={user.avatar} size="xl" shape="square" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Тег</dt>
            <dd className="font-mono text-xs">{user.tag}</dd>
            <dt className="text-muted-foreground">Наиграно</dt>
            <dd className="tabular">{formatNumber(user.playtimeHours)} ч</dd>
            <dt className="text-muted-foreground">Регистрация</dt>
            <dd className="tabular">{formatDate(user.joinedAt)}</dd>
          </dl>
        </div>
      </QuickView>
    </DemoBlock>
  );
}

/* --------------------------------- FloatingPanel --------------------------------- */

function FloatingPanelDemo() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const queue = demoUsers.slice(0, 4);
  const done = 3;

  return (
    <DemoBlock
      title="FloatingPanel"
      use="Немодальная рабочая панель поверх страницы: прогресс массовой операции, черновик, мини-консоль. Не перехватывает фокус."
      avoid="того, что требует решения пользователя (Dialog), и разовых сообщений (toast)."
    >
      <DemoRow>
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={open}>
          Открыть панель
        </Button>
        <Button variant="ghost" onClick={() => setCollapsed((value) => !value)} disabled={!open}>
          {collapsed ? 'Развернуть' : 'Свернуть'}
        </Button>
      </DemoRow>
      <DemoResult>
        {open ? `Панель открыта${collapsed ? ', свёрнута' : ''}` : 'Панель закрыта'}
      </DemoResult>
      <FloatingPanel
        open={open}
        onOpenChange={setOpen}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        title={`Массовый бан: ${done} из ${queue.length}`}
        icon={<ShieldBan />}
        position="bottom-left"
        footer={
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Отменить остальные
          </Button>
        }
      >
        <ul className="flex flex-col gap-2">
          {queue.map((user, index) => (
            <li key={user.id} className="flex items-center justify-between gap-3">
              <span className="truncate">{user.username}</span>
              {index < done ? (
                <StatusBadge status="blocked">Забанен</StatusBadge>
              ) : (
                <Spinner size="sm" label="Баним…" />
              )}
            </li>
          ))}
        </ul>
        <Progress value={(done / queue.length) * 100} label="Прогресс бана" className="mt-3" />
      </FloatingPanel>
    </DemoBlock>
  );
}

/* ------------------------------------ Lightbox ----------------------------------- */

const GALLERY: LightboxImage[] = ['Steve', 'Alex', 'Notch'].map((nick) => ({
  src: `https://mc-heads.net/avatar/${nick}/256`,
  alt: `Голова скина ${nick}`,
  caption: `Скин ${nick} · mc-heads.net`,
}));

function LightboxDemo() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  return (
    <DemoBlock
      title="Lightbox"
      use="Полноэкранный просмотр галереи: скриншоты сервера, карта. Стрелки и свайп переключают, Esc и клик по пустому закрывают."
      avoid="единственной картинки без галереи — хватит обычного Dialog или ссылки."
    >
      <DemoRow>
        {GALLERY.map((image, imageIndex) => (
          <button
            key={image.src}
            type="button"
            aria-label={`Открыть: ${image.alt}`}
            onClick={() => {
              setIndex(imageIndex);
              setOpen(true);
            }}
            className="rounded-sm transition-opacity duration-fast hover:opacity-80"
          >
            <Avatar name={image.alt} src={image.src} size="xl" shape="square" />
          </button>
        ))}
      </DemoRow>
      <DemoResult>
        Изображение {index + 1} из {GALLERY.length}
      </DemoResult>
      <Lightbox
        images={GALLERY}
        index={index}
        onIndexChange={setIndex}
        open={open}
        onOpenChange={setOpen}
      />
    </DemoBlock>
  );
}

/* ------------------------------------- Wizard ------------------------------------ */

const WIZARD_STEPS: WizardStep[] = [
  { id: 'data', title: 'Данные', description: 'Кому и на каком сервере выдать VIP' },
  { id: 'settings', title: 'Настройки', description: 'Срок и уведомление игроку' },
  { id: 'confirm', title: 'Подтверждение', description: 'Проверьте перед выдачей' },
];

const VIP_DURATIONS = [
  { value: '7', label: '7 дней', description: 'Попробовать', price: 99 },
  { value: '30', label: '30 дней', description: 'Самый популярный', price: demoProducts[0].price },
  { value: '90', label: '90 дней', description: 'Выгоднее на 15 %', price: 749 },
];

function WizardDemo() {
  const [step, setStep] = useState(0);
  const [nick, setNick] = useState('');
  const [server, setServer] = useState<string>('');
  const [duration, setDuration] = useState('30');
  const [notify, setNotify] = useState(true);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const nickError = touched && nick.trim().length < 3 ? 'Ник — минимум 3 символа' : null;
  const serverError = touched && server === '' ? 'Выберите сервер' : null;
  const dataValid = nick.trim().length >= 3 && server !== '';
  const serverName = demoServers.find((item) => item.slug === server)?.name ?? '—';
  const chosen = VIP_DURATIONS.find((item) => item.value === duration);

  const reset = () => {
    setStep(0);
    setNick('');
    setServer('');
    setDuration('30');
    setNotify(true);
    setTouched(false);
  };

  const next = () => {
    if (step === 0) {
      setTouched(true);
      if (!dataValid) {
        return;
      }
    }
    setStep((value) => Math.min(value + 1, WIZARD_STEPS.length - 1));
  };

  const finish = () => {
    setLoading(true);
    void wait(1200).then(() => {
      setLoading(false);
      toast.success(`VIP на ${chosen?.label ?? duration} выдан игроку ${nick.trim()}`, {
        description: `${serverName}${notify ? ' · игрок уведомлён' : ''}`,
      });
      reset();
    });
  };

  return (
    <DemoBlock
      title="Wizard"
      span={2}
      use="Многошаговая форма: регистрация, покупка, выдача привилегии. Валидация — у вызывающего кода, мастер только блокирует кнопки."
      avoid="форм из 3–5 полей — их лучше показать целиком."
    >
      <Wizard
        steps={WIZARD_STEPS}
        current={step}
        onStepChange={setStep}
        canNext={step === 0 ? dataValid || !touched : true}
        onBack={() => setStep((value) => Math.max(0, value - 1))}
        onNext={next}
        onFinish={finish}
        loading={loading}
        finishLabel="Выдать VIP"
      >
        <div className="flex min-h-48 flex-col gap-4">
          {step === 0 ? (
            <>
              <Field label="Ник игрока" required error={nickError}>
                <Input
                  value={nick}
                  autoComplete="off"
                  placeholder="Steve_Mainer"
                  onChange={(event) => setNick(event.target.value)}
                />
              </Field>
              <Select value={server} onValueChange={setServer}>
                <Field label="Сервер" required error={serverError}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите сервер" />
                  </SelectTrigger>
                </Field>
                <SelectContent>
                  {demoServers.map((item) => (
                    <SelectItem key={item.id} value={item.slug} disabled={!item.online}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Длительность</p>
                <RadioCards
                  aria-label="Длительность VIP"
                  value={duration}
                  onValueChange={setDuration}
                  columns={3}
                  options={VIP_DURATIONS.map((item) => ({
                    value: item.value,
                    label: item.label,
                    description: item.description,
                    addon: formatMoney(item.price),
                  }))}
                />
              </div>
              <SwitchField
                label="Уведомить игрока"
                description="Сообщение в игре и на сайте"
                checked={notify}
                onCheckedChange={setNotify}
              />
            </>
          ) : null}
          {step === 2 ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Игрок</dt>
              <dd className="font-medium">{nick.trim()}</dd>
              <dt className="text-muted-foreground">Сервер</dt>
              <dd>{serverName}</dd>
              <dt className="text-muted-foreground">Срок</dt>
              <dd>
                {chosen?.label} · {chosen ? formatMoney(chosen.price) : '—'}
              </dd>
              <dt className="text-muted-foreground">Уведомление</dt>
              <dd>{notify ? 'Да' : 'Нет'}</dd>
            </dl>
          ) : null}
        </div>
      </Wizard>
    </DemoBlock>
  );
}
