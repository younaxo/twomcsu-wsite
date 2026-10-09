'use client';

import { BookOpen, Check, Copy, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { PROMO_START, SERVER_ADDRESS } from '@/lib/site/config';
import { CopyAddressButton } from './copy-address-button';
import { HomeSection } from './section';

const STEPS = [
  {
    title: 'Запусти Minecraft',
    text: 'Java Edition подходящей версии (список версий — выше, в hero).',
  },
  { title: `Добавь ${SERVER_ADDRESS}`, text: 'Мультиплеер → Добавить сервер → вставь адрес.' },
  { title: 'Начинай играть', text: 'Подключайся, читай правила и заходи в сообщество.' },
];

/// Промокод для старта: код + «Скопировать» (toast), где применить. Награда
/// не обещается — её определяет backend при применении кода в магазине.
export function PromoStart() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMO_START.code);
      setCopied(true);
      toast.success(`Промокод ${PROMO_START.code} скопирован`, { description: PROMO_START.hint });
    } catch {
      toast.error(`Не удалось скопировать. Промокод: ${PROMO_START.code}`);
    }
  };

  return (
    <div
      data-testid="promo-start"
      className="flex flex-col gap-3 rounded-xl border bg-surface p-5 shadow sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
          <Ticket aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle-foreground">
            {PROMO_START.title}
          </p>
          <p className="mt-0.5 flex items-center gap-2">
            <code
              data-testid="promo-code"
              className="rounded-sm border border-dashed border-border-strong bg-surface-sunken px-2 py-0.5 font-mono text-lg font-bold tracking-widest"
            >
              {PROMO_START.code}
            </code>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{PROMO_START.hint}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        aria-label={`Скопировать промокод ${PROMO_START.code}`}
        onClick={copy}
        data-copied={copied || undefined}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? 'Скопировано' : 'Скопировать'}
      </Button>
    </div>
  );
}

/// «Как играть»: три шага, промокод START, действия. «Подробная инструкция»
/// появится вместе с Wiki — до тех пор кнопка честно недоступна, а не ведёт в 404.
export function HomeQuickStart() {
  return (
    <HomeSection id="quick-start" eyebrow="Как играть" title="Как зайти на twomc.su">
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4 rounded-xl border bg-surface p-5 shadow">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-sm font-bold text-primary-soft-foreground"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <PromoStart />
      <div className="flex flex-wrap items-center gap-3">
        <CopyAddressButton />
        <Tooltip content="Подробная инструкция появится вместе с Wiki">
          <Button
            variant="secondary"
            aria-disabled="true"
            onClick={(event) => event.preventDefault()}
          >
            <BookOpen />
            Подробная инструкция
            <span className="rounded-sm bg-muted px-1 text-[10px] uppercase tracking-wide text-subtle-foreground">
              скоро
            </span>
          </Button>
        </Tooltip>
      </div>
    </HomeSection>
  );
}
