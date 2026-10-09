# TwoMC UI layer (`@/components/ui`)

Единственный слой UI-примитивов проекта. Feature-код импортирует только
отсюда: `<Tooltip>`, `<Dialog>`, `<Drawer>`, `toast.success()` — никогда
напрямую `radix-ui` / `vaul` / `sonner` / `cmdk`. Реализация внутри может
меняться без переписывания страниц.

## Контракт

- **Один файл — один компонент (или семейство):** `button.tsx`, `tooltip.tsx`,
  `dialog.tsx`. Именованные экспорты в PascalCase, без default-экспорта.
- **Клиентские компоненты** помечаются `'use client'` только если используют
  хуки/Radix/события. Чистая разметка (Card, Badge, Kbd, Skeleton) — server-safe.
- **Стили только через семантические токены** (`bg-surface`, `text-muted-foreground`,
  `border-border`, `rounded`, `shadow`, `h-control`, `px-control-px`) —
  никаких hex/`gray-500`/`rounded-xl` в компонентах. Направление дизайна
  переключается `data-direction` на корне, компонент об этом не знает.
- **Варианты** — `class-variance-authority` (`cva`) + `cn()` из `@/lib/cn`.
  `className` всегда пробрасывается последним аргументом `cn(...)`.
- **`forwardRef`** на корневой DOM-элемент; `...props` пробрасываются.
  Композиция через Radix `Slot` (`asChild`) там, где это уместно (Button, Link).
- **Иконки — только `lucide-react`**, размер по умолчанию 16px (`size-4`),
  `aria-hidden` у декоративных; icon-only кнопки обязаны иметь `aria-label`.
- **Доступность:** нативные элементы (`<button>`, `<a>`), `:focus-visible`
  из `globals.css` (не убирать outline без замены), подписи у полей,
  ошибки рядом с полем + `aria-invalid`/`aria-describedby`, live-region для
  async-сообщений, touch-target ≥ 40px на coarse pointer. Цвет никогда не
  единственный носитель состояния (иконка/текст рядом).
- **Движение:** только `transform`/`opacity`, длительности из токенов
  (`duration-fast`/`duration`/`duration-slow`), появление/исчезновение
  overlay через `data-[state=open]:animate-pop-in` и т.п. Никаких bounce.
  `prefers-reduced-motion` гасится глобально в `globals.css`.
- **Тексты** на русском, sentence case, глагол в CTA («Сохранить изменения»),
  ошибки говорят что делать дальше.
- **Не плодить API:** если компонент — тонкая обёртка над Radix, экспортировать
  части как `Dialog`, `DialogTrigger`, `DialogContent`… (shadcn-стиль), но
  визуал — свой.

## Семейства

| Семейство | База                         | Компоненты                                                                                                                                                                                                                                    |
| --------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floating  | Radix                        | `Tooltip` (simple/rich/shortcut/help/validation), `Toggletip`, `Hint`, `Popover`, `HoverCard`, `DropdownMenu`, `ContextMenu`                                                                                                                  |
| Overlay   | Radix / Vaul / Sonner / cmdk | `Dialog`, `AlertDialog`, `Sheet`, `Drawer`/`BottomSheet`, `QuickView`, `FloatingPanel`, `Command`, `toast` + `Toaster`                                                                                                                        |
| Forms     | Radix                        | `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `SegmentedControl`, `Tabs`, `Accordion`, `Stepper`, `OtpInput`, `Combobox`, `MultiSelect`, `DatePicker`, `FileDropzone`, `Field`/`Label` |
| Data      | —                            | `Table`, `DataGrid`, `Pagination`, `Skeleton`, `Progress`/`ProgressRing`, `Badge`, `StatusBadge`, `Avatar`/`AvatarStack`, `Breadcrumbs`, `Timeline`, `EmptyState`, `ErrorState`, `Kbd`, `Card`, `Separator`                                   |

Состояния, которые компонент обязан поддерживать там, где они осмысленны:
default · hover · active · focus-visible · disabled · loading · error · success.
