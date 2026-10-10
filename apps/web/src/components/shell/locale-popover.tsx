'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { CURRENCIES, LOCALES } from '@/lib/site/config';
import { findCurrency, findLocale, usePreferences } from '@/lib/site/preferences';
import { FlagIcon } from '@/components/ui/flag-icon';

/// Язык и валюта — две независимые настройки в одном popover (rail и footer).
/// Варианты без поддержки на сервере показаны как «скоро» и не выбираются —
/// не выдаём несуществующее за рабочее.

interface OptionProps {
  selected: boolean;
  available: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  label: string;
}

function Option({ selected, available, onSelect, children, label }: OptionProps) {
  return (
    <li role="option" aria-selected={selected} aria-disabled={!available || undefined}>
      <button
        type="button"
        disabled={!available}
        aria-label={label}
        onClick={onSelect}
        className={cn(
          'flex h-control-sm w-full items-center gap-2 rounded-sm px-2 text-left text-sm',
          available ? 'hover:bg-muted' : 'cursor-not-allowed text-muted-foreground/70',
          selected && 'bg-primary-soft/60 text-primary-soft-foreground',
        )}
      >
        {children}
        {!available ? (
          <span className="ml-auto rounded-sm bg-muted px-1 text-[10px] uppercase tracking-wide text-subtle-foreground">
            скоро
          </span>
        ) : selected ? (
          <Check aria-hidden className="ml-auto size-4 text-primary" />
        ) : null}
      </button>
    </li>
  );
}

export function LocalePopover({
  variant = 'rail',
  className,
}: {
  variant?: 'rail' | 'footer';
  className?: string;
}) {
  const localeCode = usePreferences((state) => state.locale);
  const currencyCode = usePreferences((state) => state.currency);
  const setLocale = usePreferences((state) => state.setLocale);
  const setCurrency = usePreferences((state) => state.setCurrency);
  const locale = findLocale(localeCode);
  const currency = findCurrency(currencyCode);
  const summary = `${locale.label} · ${currency.code} ${currency.symbol}`;

  const trigger =
    variant === 'rail' ? (
      <button
        type="button"
        aria-label={`Язык и валюта: ${summary}`}
        data-testid="locale-trigger"
        className={cn(
          'flex h-12 w-10 flex-col items-center justify-center gap-0.5 rounded leading-none transition-colors duration-fast hover:bg-muted',
          className,
        )}
      >
        <FlagIcon code={locale.flag} className="text-lg" />
        <span aria-hidden className="font-mono text-[10px] font-semibold text-muted-foreground">
          {currency.code}
        </span>
      </button>
    ) : (
      <button
        type="button"
        aria-label={`Язык и валюта: ${summary}`}
        data-testid="locale-trigger"
        className={cn(
          'inline-flex h-control-sm items-center gap-2 rounded border bg-surface px-3 text-sm hover:bg-muted',
          className,
        )}
      >
        <FlagIcon code={locale.flag} />
        <span>{locale.label}</span>
        <span aria-hidden className="text-subtle-foreground">
          ·
        </span>
        <span className="font-mono text-xs tabular">
          {currency.code} {currency.symbol}
        </span>
        <ChevronDown aria-hidden className="size-4 text-subtle-foreground" />
      </button>
    );

  return (
    <Popover>
      {variant === 'rail' ? (
        <Tooltip content={`Язык и валюта: ${summary}`} side="right">
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent
        side={variant === 'rail' ? 'right' : 'top'}
        align="end"
        className="w-64 p-2"
        aria-label="Язык и валюта"
      >
        <p className="px-2 py-1 text-xs font-medium text-subtle-foreground">Язык</p>
        <ul role="listbox" aria-label="Язык">
          {LOCALES.map((item) => (
            <Option
              key={item.code}
              label={item.label}
              selected={item.code === locale.code}
              available={item.available}
              onSelect={() => setLocale(item.code)}
            >
              <FlagIcon code={item.flag} />
              {item.label}
            </Option>
          ))}
        </ul>
        <p className="mt-2 px-2 py-1 text-xs font-medium text-subtle-foreground">Валюта</p>
        <ul role="listbox" aria-label="Валюта">
          {CURRENCIES.map((item) => (
            <Option
              key={item.code}
              label={`${item.code} — ${item.label}`}
              selected={item.code === currency.code}
              available={item.available}
              onSelect={() => setCurrency(item.code)}
            >
              <span className="w-4 text-center font-mono text-xs text-muted-foreground">
                {item.symbol}
              </span>
              {item.code}
              <span className="text-muted-foreground">· {item.label}</span>
            </Option>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
