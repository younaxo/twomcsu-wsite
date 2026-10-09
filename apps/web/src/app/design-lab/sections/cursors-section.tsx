'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/// Собственный курсор «Полдня» (ADR-0075) — наведите на зоны (только мышь/тачпад;
/// на touch-устройствах остаётся системный курсор).
export function CursorsSection() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="flex h-24 items-center justify-center rounded-xl bg-surface text-sm text-muted-foreground shadow-sm">
        Обычная область
      </div>
      <a
        href="#cursors"
        className="flex h-24 items-center justify-center rounded-xl bg-surface text-sm text-primary shadow-sm"
      >
        Ссылка / кнопка
      </a>
      <div className="flex h-24 items-center rounded-xl bg-surface px-4 shadow-sm">
        <Input placeholder="Текстовое поле" aria-label="Текстовое поле" />
      </div>
      <div
        draggable
        className="flex h-24 items-center justify-center rounded-xl bg-surface text-sm text-muted-foreground shadow-sm"
      >
        Перетаскивание (нажмите)
      </div>
      <div className="flex h-24 items-center justify-center rounded-xl bg-surface shadow-sm">
        <Button disabled>Недоступно</Button>
      </div>
    </div>
  );
}
