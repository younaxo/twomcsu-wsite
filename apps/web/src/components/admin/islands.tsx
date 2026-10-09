import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/// Композиция вкладки настроек: слева — редактируемые острова, справа —
/// сводка/подсказки. `items-start`: острова по высоте содержимого, без
/// растягивания под соседнюю колонку (раньше давало огромные пустые карточки).
export function SettingsLayout({ main, aside }: { main: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-5">{main}</div>
      {aside ? (
        <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24">{aside}</aside>
      ) : null}
    </div>
  );
}

/// Остров настроек: solid-поверхность, заголовок + описание + содержимое.
export function SettingsIsland({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm edge-highlight',
        className,
      )}
      {...props}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/// Боковая панель: сводка/подсказка/статус. Тише основного острова.
export function SettingsAside({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('flex flex-col gap-3 rounded-xl bg-background-subtle p-4 text-sm', className)}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/// Строка сводки «параметр — значение».
export function SummaryRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
