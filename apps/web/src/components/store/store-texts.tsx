'use client';

import { ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useStoreTexts, type StoreTextKey } from '@/lib/store/texts';

/// Публичные тексты магазина (0.11, ADR-0189): только ТЕКСТ. React экранирует
/// значения (HTML виден как символы), без dangerouslySetInnerHTML и Markdown;
/// переводы строк сохраняются CSS `white-space: pre-line`.

export function PlainText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn('whitespace-pre-line break-words text-sm leading-relaxed', className)}>
      {text}
    </p>
  );
}

const SECTIONS: { key: StoreTextKey; title: string; empty: string }[] = [
  {
    key: 'store.text.unban_rules',
    title: 'Снятие банов',
    empty: 'Правила снятия банов пока не опубликованы.',
  },
  {
    key: 'store.text.unmute_rules',
    title: 'Снятие мутов',
    empty: 'Правила снятия мутов пока не опубликованы.',
  },
  {
    key: 'store.text.refund_policy',
    title: 'Политика возвратов',
    empty: 'Политика возвратов пока не опубликована.',
  },
  {
    key: 'store.text.perk_descriptions',
    title: 'Описания перков',
    empty: 'Описания перков пока не опубликованы.',
  },
];

/// Вступление магазина: ничего не показывает, пока текст пуст.
export function StoreIntroText() {
  const texts = useStoreTexts();
  const intro = texts.data?.['store.text.shop_intro']?.trim();
  if (!intro) return null;
  return <PlainText text={intro} className="text-muted-foreground" />;
}

/// Правила и условия: честные пустые состояния, без выдуманных обещаний.
export function StoreTextsSection() {
  const texts = useStoreTexts();
  return (
    <section
      id="rules"
      aria-labelledby="store-rules-title"
      className="scroll-mt-24"
      aria-busy={texts.isPending}
    >
      <Card variant="sunken" className="flex flex-col gap-4">
        <h2 id="store-rules-title" className="flex items-center gap-2 text-base font-semibold">
          <ScrollText aria-hidden className="size-5 text-primary" />
          Правила и условия
        </h2>
        {texts.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Загрузка правил…
          </p>
        ) : texts.isError ? (
          <p className="text-sm text-muted-foreground">
            Не удалось загрузить правила. Обновите страницу позже.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {SECTIONS.map((section) => {
              const text = texts.data[section.key]?.trim();
              return (
                <div key={section.key} data-testid={`store-text-${section.key}`}>
                  <h3 className="mb-1 text-sm font-semibold">{section.title}</h3>
                  {text ? (
                    <PlainText text={text} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{section.empty}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}
