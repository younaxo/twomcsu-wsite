'use client';

import { ChevronDown, Pipette } from 'lucide-react';
import { Popover } from 'radix-ui';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { cn } from '@/lib/cn';
import { useIsMobile } from '@/lib/use-media-query';
import { Button } from './button';
import { BottomSheet, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle } from './drawer';
import { Input } from './input';
import { selectTriggerVariants } from './select';

/// ColorPicker — встроенный выбор цвета (цвет роли, метки): готовые цвета,
/// HEX-поле, при необходимости — собственная палитра (область насыщенность/
/// яркость + ползунок оттенка) ВНУТРИ popover. Системный color dialog
/// (нативный <input type="color">) не используется никогда. На телефоне —
/// нижняя панель вместо тесного popover. Значение — `#rrggbb` или `null`.

export const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/// Готовые цвета по умолчанию (подписи — для aria-label). Домен может
/// передать свои через `presets` + `presetLabels`.
export const DEFAULT_COLOR_PRESETS: { hex: string; label: string }[] = [
  { hex: '#f26a1b', label: 'Оранжевый' },
  { hex: '#e5484d', label: 'Красный' },
  { hex: '#d6409f', label: 'Розовый' },
  { hex: '#8e4ec6', label: 'Фиолетовый' },
  { hex: '#3e63dd', label: 'Синий' },
  { hex: '#0090ff', label: 'Голубой' },
  { hex: '#12a594', label: 'Бирюзовый' },
  { hex: '#30a46c', label: 'Зелёный' },
  { hex: '#f5d90a', label: 'Жёлтый' },
  { hex: '#ad7f58', label: 'Коричневый' },
  { hex: '#8b8d98', label: 'Серый' },
  { hex: '#f0eee9', label: 'Светлый' },
];

export interface ColorPickerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange' | 'defaultValue'
> {
  value: string | null;
  onChange: (value: string | null) => void;
  /// Готовые цвета (hex). Без значения — DEFAULT_COLOR_PRESETS.
  presets?: string[];
  presetLabels?: Record<string, string>;
  /// Встроенная палитра (область + оттенок) и HEX-поле.
  allowCustom?: boolean;
  clearable?: boolean;
  invalid?: boolean;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

/* ------------------------------ HSV ↔ HEX ------------------------------ */

export interface Hsv {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/* ------------------------------ Палитра -------------------------------- */

/// Область насыщенность × яркость для текущего оттенка. Мышь/палец —
/// pointer events, клавиатура — стрелки (шаг 2 %, с Shift — 10 %).
function SaturationArea({ hsv, onChange }: { hsv: Hsv; onChange: (next: Hsv) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pick = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const v = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
      onChange({ h: hsv.h, s, v });
    },
    [hsv.h, onChange],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const map: Record<string, Hsv> = {
      ArrowLeft: { ...hsv, s: clamp(hsv.s - step, 0, 1) },
      ArrowRight: { ...hsv, s: clamp(hsv.s + step, 0, 1) },
      ArrowUp: { ...hsv, v: clamp(hsv.v + step, 0, 1) },
      ArrowDown: { ...hsv, v: clamp(hsv.v - step, 0, 1) },
    };
    const next = map[event.key];
    if (next) {
      event.preventDefault();
      onChange(next);
    }
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Насыщенность и яркость"
      aria-valuetext={`насыщенность ${Math.round(hsv.s * 100)} %, яркость ${Math.round(hsv.v * 100)} %`}
      aria-valuenow={Math.round(hsv.v * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        pick(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) pick(event);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      className="relative h-28 w-full cursor-crosshair touch-none select-none rounded-sm border border-border-strong/40"
      style={{
        backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }),
        backgroundImage:
          'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
      />
    </div>
  );
}

const HUE_GRADIENT =
  'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)';

function HueSlider({ hue, onChange }: { hue: number; onChange: (hue: number) => void }) {
  return (
    <input
      type="range"
      aria-label="Оттенок"
      min={0}
      max={360}
      step={1}
      value={Math.round(hue)}
      onChange={(event) => onChange(Number(event.target.value))}
      className={cn(
        'h-3 w-full cursor-pointer appearance-none rounded-full border border-border-strong/40',
        '[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgb(0_0_0/0.5)]',
        '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent',
      )}
      style={{ background: HUE_GRADIENT }}
    />
  );
}

/* ------------------------------ Панель --------------------------------- */

interface ColorPanelProps {
  value: string | null;
  onChange: (value: string | null) => void;
  presets: string[];
  presetLabels?: Record<string, string>;
  allowCustom: boolean;
  clearable: boolean;
  onClose: () => void;
}

function ColorPanel({
  value,
  onChange,
  presets,
  presetLabels,
  allowCustom,
  clearable,
  onClose,
}: ColorPanelProps) {
  const hexErrorId = useId();
  const current = value ? normalizeHex(value) : null;
  const [draft, setDraft] = useState(current ?? '');
  const [editing, setEditing] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(current ?? presets[0] ?? '#f26a1b'));

  // Внешнее значение изменилось (preset/HEX) — синхронизируем палитру и поле.
  useEffect(() => {
    if (current) {
      setHsv((prev) => (hsvToHex(prev) === current ? prev : hexToHsv(current)));
    }
    if (!editing) {
      setDraft(current ?? '');
    }
  }, [current, editing]);

  const draftInvalid = draft.trim() !== '' && !HEX_PATTERN.test(draft.trim());
  const presetMeta = presets.map((preset) => {
    const hex = normalizeHex(preset);
    const fromDefault = DEFAULT_COLOR_PRESETS.find((p) => p.hex === hex)?.label;
    return { hex, label: presetLabels?.[preset] ?? presetLabels?.[hex] ?? fromDefault ?? hex };
  });

  const applyHsv = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };

  return (
    <div className="flex flex-col gap-3" data-testid="color-panel">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          data-testid="color-preview"
          className={cn(
            'size-9 shrink-0 rounded border border-border-strong/40',
            !current && 'bg-surface-sunken',
          )}
          style={current ? { backgroundColor: current } : undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{current ? 'Выбранный цвет' : 'Цвет не выбран'}</p>
          <p className="font-mono text-xs uppercase text-muted-foreground tabular">
            {current ?? '—'}
          </p>
        </div>
      </div>

      <div role="group" aria-label="Готовые цвета" className="grid grid-cols-6 gap-1.5">
        {presetMeta.map(({ hex, label }) => {
          const pressed = hex === current;
          return (
            <button
              key={hex}
              type="button"
              aria-label={label}
              aria-pressed={pressed}
              onClick={() => onChange(hex)}
              style={{ backgroundColor: hex }}
              className={cn(
                'size-8 rounded-sm border border-border-strong/40 transition-[box-shadow] duration-fast',
                'hover:ring-2 hover:ring-border-strong hover:ring-offset-1 hover:ring-offset-surface-overlay',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-overlay',
                pressed && 'ring-2 ring-primary ring-offset-2 ring-offset-surface-overlay',
              )}
            />
          );
        })}
      </div>

      {allowCustom ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Input
              size="sm"
              aria-label="HEX-код цвета"
              aria-describedby={draftInvalid ? hexErrorId : undefined}
              invalid={draftInvalid}
              value={draft}
              placeholder="#RRGGBB"
              maxLength={7}
              spellCheck={false}
              autoCapitalize="off"
              className="font-mono uppercase tabular"
              onFocus={() => setEditing(true)}
              onChange={(event) => {
                const raw = event.target.value;
                const next = raw.startsWith('#') || raw === '' ? raw : `#${raw}`;
                setDraft(next);
                if (HEX_PATTERN.test(next.trim())) {
                  onChange(normalizeHex(next));
                }
              }}
              onBlur={() => {
                setEditing(false);
                if (!draftInvalid) setDraft(current ?? '');
              }}
            />
            <Button
              type="button"
              variant={advanced ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={advanced}
              aria-label="Свой цвет: палитра"
              onClick={() => setAdvanced((v) => !v)}
            >
              <Pipette />
              Палитра
            </Button>
          </div>
          {draftInvalid ? (
            <p id={hexErrorId} role="alert" className="text-xs text-destructive">
              Формат: «#» и шесть символов 0–9, A–F.
            </p>
          ) : null}
          {advanced ? (
            <div className="flex flex-col gap-2" data-testid="color-advanced">
              <SaturationArea hsv={hsv} onChange={applyHsv} />
              <HueSlider hue={hsv.h} onChange={(h) => applyHsv({ ...hsv, h })} />
            </div>
          ) : null}
        </div>
      ) : null}

      {clearable ? (
        <div className="flex justify-end border-t border-border-subtle pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!current}
            onClick={() => {
              onChange(null);
              onClose();
            }}
          >
            Без цвета
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ Компонент ------------------------------ */

export const ColorPicker = forwardRef<HTMLButtonElement, ColorPickerProps>(
  (
    {
      value,
      onChange,
      presets,
      presetLabels,
      allowCustom = true,
      clearable = true,
      invalid,
      placeholder = 'Выберите цвет',
      size,
      className,
      disabled,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const mobile = useIsMobile();
    const current = value ? normalizeHex(value) : null;
    const effectivePresets = presets ?? DEFAULT_COLOR_PRESETS.map((p) => p.hex);

    const trigger = (
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-state={open ? 'open' : 'closed'}
        data-invalid={invalid || ariaInvalid === true || ariaInvalid === 'true' ? '' : undefined}
        data-placeholder={current ? undefined : ''}
        disabled={disabled}
        onClick={mobile ? () => setOpen(true) : undefined}
        className={cn(selectTriggerVariants({ size }), className)}
        {...props}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'size-4 shrink-0 rounded-sm border border-border-strong/40',
              !current && 'bg-surface-sunken',
            )}
            style={current ? { backgroundColor: current } : undefined}
          />
          <span className={cn('truncate', current && 'font-mono uppercase tabular')}>
            {current ?? placeholder}
          </span>
        </span>
        <ChevronDown aria-hidden className="text-subtle-foreground" />
      </button>
    );

    const panel = (
      <ColorPanel
        value={value}
        onChange={onChange}
        presets={effectivePresets}
        presetLabels={presetLabels}
        allowCustom={allowCustom}
        clearable={clearable}
        onClose={() => setOpen(false)}
      />
    );

    if (mobile) {
      return (
        <>
          {trigger}
          <BottomSheet open={open} onOpenChange={setOpen}>
            <DrawerContent aria-describedby={undefined}>
              <DrawerHeader>
                <DrawerTitle>Цвет</DrawerTitle>
              </DrawerHeader>
              <DrawerBody>{panel}</DrawerBody>
            </DrawerContent>
          </BottomSheet>
        </>
      );
    }

    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>{trigger}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            aria-label="Выбор цвета"
            className={cn(
              'z-popover w-72 max-w-[calc(100vw-2rem)] p-3',
              'rounded-lg border bg-surface-overlay text-foreground shadow-lg',
              'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
              'data-[side=bottom]:[--pop-y:-4px] data-[side=top]:[--pop-y:4px]',
            )}
          >
            {panel}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
ColorPicker.displayName = 'ColorPicker';
