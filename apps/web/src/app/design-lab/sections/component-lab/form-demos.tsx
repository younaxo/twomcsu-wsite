'use client';

import {
  CalendarDays,
  Download,
  LayoutGrid,
  List,
  Plus,
  Search,
  Settings,
  Table2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton, type ButtonProps } from '@/components/ui/button';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { ColorPicker } from '@/components/ui/color-picker';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { DatePicker, toIsoDate, type IsoDate } from '@/components/ui/date-picker';
import { Field } from '@/components/ui/field';
import { FileDropzone, formatFileSize } from '@/components/ui/file-dropzone';
import { Input, Textarea } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { OtpInput } from '@/components/ui/otp-input';
import { RadioCards, RadioField, RadioGroup } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { NumberStepper, Steps, StepsItem } from '@/components/ui/stepper';
import { Switch, SwitchField } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpTooltip } from '@/components/ui/tooltip';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { demoPermissionsByModule, demoProducts, demoServers, demoUsers } from '../../demo-data';
import {
  DemoBlock,
  DemoGrid,
  DemoResult,
  DemoRow,
  ROLE_COLOR_LABELS,
  ROLE_COLORS,
  ROLE_NAMES,
} from './shared';

/// Группа «Формы»: все контролы ввода, выбора и переключения + Button.
export function FormDemos() {
  return (
    <DemoGrid>
      <InputDemo />
      <TextareaDemo />
      <FieldDemo />
      <SelectDemo />
      <ComboboxDemo />
      <MultiSelectDemo />
      <CheckboxDemo />
      <RadioDemo />
      <SwitchDemo />
      <SliderDemo />
      <SegmentedControlDemo />
      <TabsDemo />
      <AccordionDemo />
      <NumberStepperDemo />
      <StepsDemo />
      <OtpDemo />
      <DatePickerDemo />
      <FileDropzoneDemo />
      <ColorPickerDemo />
      <ButtonDemo />
    </DemoGrid>
  );
}

/* ------------------------------------- Input ------------------------------------- */

function InputDemo() {
  return (
    <DemoBlock
      title="Input"
      use="Однострочный ввод: ник, e-mail, поиск. Размеры sm/md/lg, иконка слева, состояния через Field."
      avoid="многострочного текста (Textarea) и выбора из списка (Select/Combobox)."
    >
      <Field label="Ник" hint="3–16 символов, латиница, цифры и «_»">
        <Input placeholder="Steve_Mainer" autoComplete="off" />
      </Field>
      <Input leading={<Search />} placeholder="Поиск игрока" aria-label="Поиск игрока" />
      <Field label="E-mail" error="Адрес уже зарегистрирован — войдите или восстановите пароль">
        <Input type="email" defaultValue="steve@example.com" autoComplete="off" />
      </Field>
      <DemoRow>
        <Input size="sm" placeholder="Размер sm" aria-label="Поле размера sm" className="w-36" />
        <Input size="lg" placeholder="Размер lg" aria-label="Поле размера lg" className="w-40" />
      </DemoRow>
      <DemoRow>
        <Input
          readOnly
          value="4a2b-91c3-0f11"
          aria-label="UUID, только чтение"
          className="w-44 font-mono"
        />
        <Input disabled placeholder="Недоступно" aria-label="Недоступное поле" className="w-36" />
      </DemoRow>
    </DemoBlock>
  );
}

/* ------------------------------------ Textarea ----------------------------------- */

const REASON_LIMIT = 500;

function TextareaDemo() {
  const [value, setValue] = useState('Использование читов на Survival #1, 3 предупреждения.');
  const over = value.length > REASON_LIMIT;
  return (
    <DemoBlock
      title="Textarea"
      use="Многострочный текст: причина бана, описание роли, ответ на обращение. Счётчик символов — в labelAddon."
      avoid="коротких значений (Input) и форматированного текста — для него редактор."
    >
      <Field
        label="Причина"
        required
        hint="Видна игроку и попадает в аудит"
        error={over ? `Сократите текст: лимит ${REASON_LIMIT} символов` : null}
        labelAddon={
          <span className="text-xs text-subtle-foreground tabular">
            {formatNumber(value.length)}/{REASON_LIMIT}
          </span>
        }
      >
        <Textarea value={value} rows={4} onChange={(event) => setValue(event.target.value)} />
      </Field>
    </DemoBlock>
  );
}

/* ------------------------------------- Field ------------------------------------- */

const FIELD_STATES = [
  { value: 'hint', label: 'Подсказка' },
  { value: 'error', label: 'Ошибка' },
  { value: 'none', label: 'Без текста' },
];

function FieldDemo() {
  const [state, setState] = useState('hint');
  const [required, setRequired] = useState(true);
  return (
    <DemoBlock
      title="Field"
      use="Подпись + контрол + подсказка/ошибка, связанные через id и aria-describedby. Один контрол на Field."
      avoid="группы чекбоксов/радио — у них своя подпись через aria-label или fieldset."
    >
      <DemoRow>
        <SegmentedControl
          size="sm"
          aria-label="Состояние поля"
          options={FIELD_STATES}
          value={state}
          onValueChange={setState}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={required} onCheckedChange={(next) => setRequired(next === true)} />
          Обязательное
        </label>
      </DemoRow>
      <Field
        label="Slug роли"
        required={required}
        hint={state === 'hint' ? 'Латиница, цифры и дефис; используется в URL' : undefined}
        error={state === 'error' ? 'Такой slug уже занят — выберите другой' : null}
        labelAddon={
          <HelpTooltip content="Идентификатор роли в API. Изменить после создания нельзя." />
        }
      >
        <Input defaultValue="senior-moderator" className="font-mono" autoComplete="off" />
      </Field>
    </DemoBlock>
  );
}

/* ------------------------------------- Select ------------------------------------ */

function SelectDemo() {
  const [server, setServer] = useState('');
  const chosen = demoServers.find((item) => item.slug === server);
  return (
    <DemoBlock
      title="Select"
      use="Одно значение из короткого списка (до ~10 пунктов): сервер, статус, период. Группы и недоступные пункты."
      avoid="длинных списков с поиском (Combobox) и нескольких значений (MultiSelect)."
    >
      <Select value={server} onValueChange={setServer}>
        <Field label="Сервер" hint="Офлайн-сервера недоступны для выбора">
          <SelectTrigger>
            <SelectValue placeholder="Выберите сервер" />
          </SelectTrigger>
        </Field>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Выживание</SelectLabel>
            {demoServers.slice(0, 2).map((item) => (
              <SelectItem key={item.id} value={item.slug} disabled={!item.online}>
                {item.name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Другое</SelectLabel>
            {demoServers.slice(2).map((item) => (
              <SelectItem key={item.id} value={item.slug} disabled={!item.online}>
                {item.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <DemoResult>
        {chosen
          ? `${chosen.name}: ${formatNumber(chosen.players)} из ${formatNumber(chosen.maxPlayers)} онлайн`
          : 'Сервер не выбран'}
      </DemoResult>
    </DemoBlock>
  );
}

/* ------------------------------------ Combobox ----------------------------------- */

const PLAYER_OPTIONS: ComboboxOption[] = demoUsers.map((user) => ({
  value: user.id,
  label: user.username,
  description: user.role,
  keywords: [user.tag, user.role],
  disabled: user.banned,
}));

function ComboboxDemo() {
  const [value, setValue] = useState<string | null>(null);
  const chosen = demoUsers.find((user) => user.id === value);
  return (
    <DemoBlock
      title="Combobox"
      use="Одно значение из длинного списка с поиском: игрок, роль из сотен, товар. Повторный выбор снимает значение (clearable)."
      avoid="коротких списков (Select) — поиск там только мешает."
    >
      <Field label="Игрок" hint="Поиск по нику, тегу и роли; забаненные недоступны">
        <Combobox
          options={PLAYER_OPTIONS}
          value={value}
          onValueChange={setValue}
          placeholder="Найти игрока"
          searchPlaceholder="Ник или тег…"
          clearable
        />
      </Field>
      <DemoResult>
        {chosen
          ? `${chosen.username} · ${chosen.role} · наиграно ${formatNumber(chosen.playtimeHours)} ч`
          : 'Игрок не выбран'}
      </DemoResult>
    </DemoBlock>
  );
}

/* ----------------------------------- MultiSelect --------------------------------- */

const ROLE_OPTIONS: ComboboxOption[] = ROLE_NAMES.map((role) => ({ value: role, label: role }));

function MultiSelectDemo() {
  const [roles, setRoles] = useState<string[]>([ROLE_NAMES[0] ?? '']);
  return (
    <DemoBlock
      title="MultiSelect"
      use="Несколько значений с поиском: роли, теги, сервера. Чипы в поле, Backspace убирает последний, лимит через max."
      avoid="2–4 вариантов — там группа чекбоксов читается лучше."
    >
      <Field label="Роли" hint="До трёх ролей; лишние чипы схлопываются в «+N»">
        <MultiSelect
          options={ROLE_OPTIONS}
          value={roles}
          onValueChange={setRoles}
          max={3}
          collapseAfter={2}
          placeholder="Добавить роль"
          searchPlaceholder="Название роли…"
        />
      </Field>
      <DemoResult>Выбрано: {roles.length > 0 ? roles.join(', ') : 'ничего'}</DemoResult>
    </DemoBlock>
  );
}

/* ------------------------------------ Checkbox ----------------------------------- */

const USER_PERMISSIONS = demoPermissionsByModule.users?.slice(0, 4) ?? [];

function CheckboxDemo() {
  const [checked, setChecked] = useState<Set<string>>(new Set(USER_PERMISSIONS.slice(0, 2)));
  const all = checked.size === USER_PERMISSIONS.length;
  const some = checked.size > 0 && !all;

  const toggle = (permission: string, next: boolean) => {
    const copy = new Set(checked);
    if (next) {
      copy.add(permission);
    } else {
      copy.delete(permission);
    }
    setChecked(copy);
  };

  return (
    <DemoBlock
      title="Checkbox / CheckboxField"
      use="Да/нет с отложенным сохранением и выбор нескольких из списка. Родительский чекбокс — indeterminate, когда выбрана часть."
      avoid="мгновенных настроек (Switch) и взаимоисключающих вариантов (RadioGroup)."
    >
      <CheckboxField
        label="Все права модуля users"
        description={`Выбрано ${checked.size} из ${USER_PERMISSIONS.length}`}
        checked={all ? true : some ? 'indeterminate' : false}
        onCheckedChange={(next) =>
          setChecked(next === true ? new Set(USER_PERMISSIONS) : new Set<string>())
        }
      />
      <div className="flex flex-col border-l border-border-subtle pl-4">
        {USER_PERMISSIONS.map((permission) => (
          <CheckboxField
            key={permission}
            label={<span className="font-mono text-xs">{permission}</span>}
            checked={checked.has(permission)}
            onCheckedChange={(next) => toggle(permission, next === true)}
            wrapperClassName="py-1.5"
          />
        ))}
      </div>
      <CheckboxField
        label="Экспорт в CSV"
        description="Недоступно для вашей роли"
        disabled
        defaultChecked
      />
    </DemoBlock>
  );
}

/* ---------------------------------- RadioGroup ----------------------------------- */

const VIP_OPTIONS = [
  { value: '7', label: '7 дней', description: 'Попробовать', price: 99 },
  { value: '30', label: '30 дней', description: 'Самый популярный', price: demoProducts[0].price },
  { value: '90', label: '90 дней', description: 'Выгоднее на 15 %', price: 749 },
];

function RadioDemo() {
  const [duration, setDuration] = useState('30');
  const [scope, setScope] = useState('all');
  const chosen = VIP_OPTIONS.find((item) => item.value === duration);
  return (
    <DemoBlock
      title="RadioGroup / RadioField / RadioCards"
      use="Один из нескольких взаимоисключающих вариантов. RadioCards — для тарифов и длительности с ценой справа."
      avoid="более 6–7 вариантов (Select) и включения/выключения (Switch)."
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Длительность VIP</p>
        <RadioCards
          aria-label="Длительность VIP"
          value={duration}
          onValueChange={setDuration}
          options={VIP_OPTIONS.map((item) => ({
            value: item.value,
            label: item.label,
            description: item.description,
            addon: formatMoney(item.price),
          }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Показывать</p>
        <RadioGroup
          aria-label="Показывать игроков"
          orientation="horizontal"
          value={scope}
          onValueChange={setScope}
        >
          <RadioField value="all" label="Всех" />
          <RadioField value="online" label="Онлайн" />
          <RadioField value="banned" label="Забаненных" disabled />
        </RadioGroup>
      </div>
      <DemoResult>
        {chosen ? `${chosen.label} за ${formatMoney(chosen.price)}` : '—'} · показывать: {scope}
      </DemoResult>
    </DemoBlock>
  );
}

/* ------------------------------------- Switch ------------------------------------ */

function SwitchDemo() {
  const [notifications, setNotifications] = useState(true);
  const [maintenance, setMaintenance] = useState(false);
  return (
    <DemoBlock
      title="Switch / SwitchField"
      use="Включено/выключено с мгновенным эффектом: настройки, флаги. SwitchField — строка настройки с подписью справа-налево."
      avoid="значений, которые нужно сохранить кнопкой — это Checkbox."
    >
      <SwitchField
        label="Уведомления о заявках в друзья"
        description="Сразу применяется ко всем устройствам"
        checked={notifications}
        onCheckedChange={setNotifications}
      />
      <SwitchField
        label="Режим техработ"
        description="Сервер закроется для игроков без роли"
        checked={maintenance}
        onCheckedChange={setMaintenance}
      />
      <SwitchField
        label="Двухфакторная аутентификация"
        description="Управляется администратором"
        checked
        disabled
      />
      <DemoRow>
        <span className="text-sm text-muted-foreground">Без подписи:</span>
        <Switch aria-label="Показывать офлайн-игроков" defaultChecked />
        <Switch aria-label="Невалидный переключатель" invalid />
      </DemoRow>
    </DemoBlock>
  );
}

/* ------------------------------------- Slider ------------------------------------ */

function SliderDemo() {
  const [limit, setLimit] = useState([40]);
  const [price, setPrice] = useState([149, 499]);
  return (
    <DemoBlock
      title="Slider"
      use="Число в диапазоне, где важна приблизительность: лимит, громкость, фильтр цены (два ползунка)."
      avoid="точных значений — там NumberStepper или Input."
    >
      <Field label={`Лимит привата: ${limit[0] ?? 0} %`}>
        <Slider
          value={limit}
          onValueChange={setLimit}
          min={0}
          max={100}
          step={5}
          marks={[0, 25, 50, 75, 100]}
          showValue
          formatValue={(value) => `${value} %`}
          thumbLabel="Лимит привата"
        />
      </Field>
      <Field
        label={`Цена: ${formatMoney(price[0] ?? 0)} — ${formatMoney(price[1] ?? 0)}`}
        hint="Два ползунка — диапазон"
      >
        <Slider
          value={price}
          onValueChange={setPrice}
          min={0}
          max={1000}
          step={10}
          minStepsBetweenThumbs={5}
          thumbLabel={['Минимальная цена', 'Максимальная цена']}
        />
      </Field>
      <Slider defaultValue={[60]} disabled thumbLabel="Недоступный ползунок" />
    </DemoBlock>
  );
}

/* -------------------------------- SegmentedControl ------------------------------- */

function SegmentedControlDemo() {
  const [view, setView] = useState('table');
  const [period, setPeriod] = useState('7d');
  return (
    <DemoBlock
      title="SegmentedControl"
      use="Режим или вид из 2–5 вариантов, всегда ровно один выбран: список/сетка, период, сортировка."
      avoid="навигации по разделам контента (Tabs) и пустого состояния «ничего не выбрано»."
    >
      <DemoRow>
        <SegmentedControl
          aria-label="Вид списка"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'table', label: 'Таблица', icon: <Table2 /> },
            { value: 'list', label: 'Список', icon: <List /> },
            { value: 'grid', label: 'Сетка', icon: <LayoutGrid /> },
          ]}
        />
      </DemoRow>
      <SegmentedControl
        aria-label="Период"
        size="sm"
        fullWidth
        value={period}
        onValueChange={setPeriod}
        options={[
          { value: '24h', label: '24 часа' },
          { value: '7d', label: '7 дней' },
          { value: '30d', label: '30 дней' },
          { value: 'all', label: 'Всё время', disabled: true },
        ]}
      />
      <DemoResult>
        Вид: {view} · период: {period}
      </DemoResult>
    </DemoBlock>
  );
}

/* -------------------------------------- Tabs ------------------------------------- */

function TabsDemo() {
  return (
    <DemoBlock
      title="Tabs (enclosed)"
      use="Внутренние режимы внутри панели или карточки: «утопленный» переключатель как SegmentedControl, но с контентом."
      avoid="главных разделов страницы — там variant line."
    >
      <Tabs variant="enclosed" defaultValue="general">
        <TabsList aria-label="Настройки роли">
          <TabsTrigger value="general">Общие</TabsTrigger>
          <TabsTrigger value="permissions" count={12}>
            Права
          </TabsTrigger>
          <TabsTrigger value="members" count={formatNumber(1280)}>
            Участники
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="text-sm text-muted-foreground">
          Название, slug, цвет и приоритет роли.
        </TabsContent>
        <TabsContent value="permissions" className="text-sm text-muted-foreground">
          Матрица прав по модулям: users, roles, news, store.
        </TabsContent>
        <TabsContent value="members" className="text-sm text-muted-foreground">
          Игроки с этой ролью, дата выдачи и кто выдал.
        </TabsContent>
      </Tabs>
    </DemoBlock>
  );
}

/* ----------------------------------- Accordion ----------------------------------- */

const FAQ = [
  {
    id: 'vip',
    question: 'Что даёт VIP?',
    answer:
      'Приват до 800 блоков, 3 дома, кит раз в сутки и цветной ник в чате. Права не меняются.',
  },
  {
    id: 'refund',
    question: 'Можно ли вернуть деньги?',
    answer:
      'Да, в течение 14 дней, если привилегия не использовалась. Напишите в поддержку с номером заказа.',
  },
  {
    id: 'transfer',
    question: 'Как перенести VIP на другой ник?',
    answer:
      'Перенос делает администратор по обращению: укажите старый и новый ник и подтвердите владение.',
  },
];

function AccordionDemo() {
  return (
    <DemoBlock
      title="Accordion"
      use="Раскрывающиеся секции: FAQ, детали заказа, редкие настройки. Одна открытая (single) или несколько (multiple)."
      avoid="контента, который нужен сразу — не прячьте главное."
    >
      <Accordion type="single" collapsible defaultValue="vip">
        {FAQ.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </DemoBlock>
  );
}

/* --------------------------------- NumberStepper --------------------------------- */

function NumberStepperDemo() {
  const [keys, setKeys] = useState(1);
  const [priority, setPriority] = useState(700);
  const product = demoProducts[1];
  return (
    <DemoBlock
      title="NumberStepper"
      use="Небольшое целое число с кнопками −/+: количество, длительность, приоритет. Стрелки ↑/↓ работают в поле."
      avoid="больших или дробных значений без шага — там обычный Input type=number."
    >
      <Field
        label={`Количество: ${product.name}`}
        hint={`Итого ${formatMoney(product.price * keys)}`}
      >
        <NumberStepper value={keys} onValueChange={setKeys} min={1} max={10} />
      </Field>
      <Field label="Приоритет роли (sm)">
        <NumberStepper
          size="sm"
          value={priority}
          onValueChange={setPriority}
          min={0}
          max={1000}
          step={50}
          wrapperClassName="w-40"
        />
      </Field>
    </DemoBlock>
  );
}

/* -------------------------------------- Steps ------------------------------------ */

const ORDER_STEPS = [
  { label: 'Корзина', description: 'VIP на 30 дней' },
  { label: 'Оплата', description: 'Карта или СБП' },
  { label: 'Выдача', description: 'Автоматически' },
];

function StepsDemo() {
  const [current, setCurrent] = useState(1);
  return (
    <DemoBlock
      title="Steps"
      use="Индикатор прогресса многошагового процесса (без кнопок — их даёт Wizard). На mobile — «Шаг N из M» и полоса."
      avoid="статусов задач и хронологии — это Timeline."
    >
      <Steps current={current}>
        {ORDER_STEPS.map((step) => (
          <StepsItem key={step.label} label={step.label} description={step.description} />
        ))}
      </Steps>
      <DemoRow>
        <Button
          size="sm"
          variant="secondary"
          disabled={current === 0}
          onClick={() => setCurrent((value) => value - 1)}
        >
          Назад
        </Button>
        <Button
          size="sm"
          disabled={current === ORDER_STEPS.length - 1}
          onClick={() => setCurrent((value) => value + 1)}
        >
          Далее
        </Button>
      </DemoRow>
    </DemoBlock>
  );
}

/* ------------------------------------ OtpInput ----------------------------------- */

const WRONG_CODE = '000000';

function OtpDemo() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'ok' | 'wrong'>('idle');
  return (
    <DemoBlock
      title="OtpInput"
      use="Код подтверждения по одной цифре в ячейку: вход, привязка почты. Вставка целого кода и автозаполнение из SMS."
      avoid="обычных паролей и кодов длиннее 8 символов."
    >
      <Field
        label="Код из письма"
        hint="Введите 6 цифр; 000000 — неверный код для проверки ошибки"
        error={status === 'wrong' ? 'Код неверный — запросите новый' : null}
      >
        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next);
            if (next.length < 6) {
              setStatus('idle');
            }
          }}
          onComplete={(next) => setStatus(next === WRONG_CODE ? 'wrong' : 'ok')}
        />
      </Field>
      <DemoResult>
        {status === 'ok' ? 'Код принят' : status === 'wrong' ? 'Код отклонён' : 'Ожидаем ввод'}
      </DemoResult>
    </DemoBlock>
  );
}

/* ----------------------------------- DatePicker ---------------------------------- */

function DatePickerDemo() {
  const [date, setDate] = useState<IsoDate | null>(null);
  const [min] = useState(() => toIsoDate(new Date()));
  return (
    <DemoBlock
      title="DatePicker"
      use="Одна календарная дата: окончание бана, начало события. Сетка с клавиатурой, Intl ru-RU, границы min/max."
      avoid="даты со временем и диапазонов — пока отдельного компонента нет."
    >
      <Field label="Бан до" hint="Не раньше сегодняшнего дня; пусто — навсегда">
        <DatePicker value={date} onChange={setDate} min={min} placeholder="Навсегда" />
      </Field>
      <DemoResult>
        <CalendarDays aria-hidden className="mr-1 inline size-3.5 align-text-bottom" />
        {date ? `Истекает ${formatDate(date)}` : 'Бессрочный бан'}
      </DemoResult>
    </DemoBlock>
  );
}

/* ---------------------------------- FileDropzone --------------------------------- */

function FileDropzoneDemo() {
  const [files, setFiles] = useState<File[]>([]);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return (
    <DemoBlock
      title="FileDropzone"
      use="Выбор файлов перетаскиванием или кнопкой: скриншоты к жалобе, аватар. Проверяет тип и размер, загрузку делает вызывающий код."
      avoid="единственного файла в компактной форме — хватит кнопки «Выбрать файл»."
    >
      <Field label="Скриншоты" hint="PNG или JPG, до 2 МБ каждый">
        <FileDropzone accept="image/*" multiple maxSizeMb={2} onFiles={setFiles} />
      </Field>
      <DemoResult>
        {files.length > 0
          ? `Файлов: ${files.length}, всего ${formatFileSize(total)}`
          : 'Файлы не выбраны'}
      </DemoResult>
    </DemoBlock>
  );
}

/* ----------------------------------- ColorPicker --------------------------------- */

function ColorPickerDemo() {
  const [color, setColor] = useState<string | null>(ROLE_COLORS[1] ?? null);
  const [empty, setEmpty] = useState<string | null>(null);
  return (
    <DemoBlock
      title="ColorPicker"
      span={2}
      use="Цвет роли/метки: готовые цвета, HEX-поле с валидацией и встроенная палитра (область + оттенок) внутри popover; на телефоне — нижняя панель. Системный color dialog не открывается никогда."
      avoid="цветов интерфейса — они только из токенов направления."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Выбран (пресеты ролей)" hint="Готовые цвета — из существующих ролей">
          <ColorPicker
            value={color}
            onChange={setColor}
            presets={ROLE_COLORS}
            presetLabels={ROLE_COLOR_LABELS}
          />
        </Field>
        <Field label="Без цвета (палитра по умолчанию)" hint="Введите HEX или откройте «Палитра»">
          <ColorPicker value={empty} onChange={setEmpty} />
        </Field>
        <Field label="Невалидное значение" error="Выберите цвет роли">
          <ColorPicker value={null} onChange={() => undefined} invalid />
        </Field>
        <Field label="Недоступно">
          <ColorPicker value="#f26a1b" onChange={() => undefined} disabled />
        </Field>
      </div>
      <DemoRow>
        <span className="text-sm text-muted-foreground">Предпросмотр:</span>
        <Badge color={color}>
          {color ? (ROLE_COLOR_LABELS[color] ?? 'Новая роль') : 'Без цвета'}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Mobile (&lt; 768px): тот же picker открывается нижней панелью.
        </span>
      </DemoRow>
    </DemoBlock>
  );
}

/* ------------------------------------- Button ------------------------------------ */

const BUTTON_VARIANTS: NonNullable<ButtonProps['variant']>[] = [
  'primary',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'destructive-outline',
  'link',
];

const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;

function ButtonDemo() {
  return (
    <DemoBlock
      title="Button / IconButton"
      span={3}
      use="Матрица вариантов и размеров + loading, disabled и icon-only кнопки (обязателен aria-label). Глагол в подписи."
      avoid="ссылок на страницы — там Link с asChild, чтобы работал Cmd-клик."
    >
      <div className="overflow-x-auto scrollbar-thin">
        <table className="text-sm">
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                Вариант
              </th>
              {BUTTON_SIZES.map((size) => (
                <th
                  key={size}
                  scope="col"
                  className="px-2 pb-2 text-left font-mono text-xs font-normal text-muted-foreground"
                >
                  {size}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BUTTON_VARIANTS.map((variant) => (
              <tr key={variant}>
                <th
                  scope="row"
                  className="whitespace-nowrap pr-3 text-left font-mono text-xs font-normal text-muted-foreground"
                >
                  {variant}
                </th>
                {BUTTON_SIZES.map((size) => (
                  <td key={size} className="p-1 align-middle">
                    <Button variant={variant} size={size}>
                      {variant.startsWith('destructive') ? 'Удалить' : 'Сохранить'}
                    </Button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DemoRow>
        <Button loading>Сохраняем</Button>
        <Button variant="secondary" loading>
          Загружаем
        </Button>
        <Button disabled>Недоступно</Button>
        <Button variant="secondary">
          <Download />С иконкой
        </Button>
        <IconButton aria-label="Настройки" variant="outline">
          <Settings />
        </IconButton>
        <IconButton aria-label="Добавить" variant="primary">
          <Plus />
        </IconButton>
        <IconButton aria-label="Закрыть" size="sm">
          <X />
        </IconButton>
        <IconButton aria-label="Недоступно" variant="outline" disabled>
          <Settings />
        </IconButton>
      </DemoRow>
    </DemoBlock>
  );
}
