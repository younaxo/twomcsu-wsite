import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/cn';

/// Постоянная метка тестового режима (ADR-G003 п. 9.1): не скрывается и не закрывается.
export function TestBadge({ className }: { className?: string }) {
  return (
    <div
      role="status"
      data-testid="test-badge"
      className={cn(
        'flex items-center justify-center gap-2 rounded border-2 border-warning bg-warning-soft px-4 py-2 text-base font-bold uppercase tracking-wider text-foreground [&_svg]:size-5',
        className,
      )}
    >
      <FlaskConical aria-hidden="true" />
      ТЕСТ
      <span className="text-sm font-medium normal-case tracking-normal">
        — данные не настоящие
      </span>
    </div>
  );
}
