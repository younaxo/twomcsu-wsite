'use client';

import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { CURRENCIES, LOCALES } from '@/lib/site/config';

/// Язык и валюта. Сейчас backend поддерживает только ru / RUB — показываем
/// их как текущие, других вариантов не рисуем (не выдавать несуществующее
/// за рабочее). Структура готова к расширению списков в config.
export function LocalePopover({
  variant = 'rail',
  className,
}: {
  variant?: 'rail' | 'footer';
  className?: string;
}) {
  const locale = LOCALES[0];
  const currency = CURRENCIES[0];
  const trigger =
    variant === 'rail' ? (
      <button
        type="button"
        aria-label={`Язык и валюта: ${locale.label}, ${currency.code}`}
        className={cn(
          'flex size-10 items-center justify-center rounded text-lg leading-none transition-colors duration-fast hover:bg-muted',
          className,
        )}
      >
        <span aria-hidden>{locale.flag}</span>
      </button>
    ) : (
      <button
        type="button"
        aria-label={`Язык: ${locale.label}`}
        className={cn(
          'inline-flex h-control-sm items-center gap-2 rounded border bg-surface px-3 text-sm hover:bg-muted',
          className,
        )}
      >
        <span aria-hidden>{locale.flag}</span>
        {locale.label}
        <span aria-hidden className="text-subtle-foreground">
          ˅
        </span>
      </button>
    );

  return (
    <Popover>
      {variant === 'rail' ? (
        <Tooltip content="Язык и валюта" side="right">
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent side={variant === 'rail' ? 'right' : 'top'} align="end" className="w-60 p-2">
        <p className="px-2 py-1 text-xs font-medium text-subtle-foreground">Язык</p>
        <ul role="listbox" aria-label="Язык">
          {LOCALES.map((item) => (
            <li
              key={item.code}
              role="option"
              aria-selected={item.code === locale.code}
              className="flex h-control-sm items-center gap-2 rounded-sm px-2 text-sm"
            >
              <span aria-hidden>{item.flag}</span>
              {item.label}
              {item.code === locale.code ? (
                <Check aria-hidden className="ml-auto size-4 text-primary" />
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 px-2 py-1 text-xs font-medium text-subtle-foreground">Валюта</p>
        <ul role="listbox" aria-label="Валюта">
          {CURRENCIES.map((item) => (
            <li
              key={item.code}
              role="option"
              aria-selected={item.code === currency.code}
              className="flex h-control-sm items-center gap-2 rounded-sm px-2 text-sm"
            >
              <span className="font-mono text-xs text-muted-foreground">{item.symbol}</span>
              {item.code} · {item.label}
              {item.code === currency.code ? (
                <Check aria-hidden className="ml-auto size-4 text-primary" />
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 px-2 pb-1 text-xs text-muted-foreground">
          Другие языки и валюты появятся вместе с их поддержкой на сервере.
        </p>
      </PopoverContent>
    </Popover>
  );
}
