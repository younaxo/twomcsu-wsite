import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/// Единая обёртка секций главной: якорь, надзаголовок, заголовок, описание
/// и действие справа. Ширина — как у остального контента (max 1440).
export function HomeSection({
  id,
  eyebrow,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-28 flex flex-col gap-6', className)}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-soft-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h2
            id={`${id}-title`}
            className="mt-1 font-display text-2xl font-bold tracking-tight md:text-3xl"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-prose text-sm text-muted-foreground md:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
