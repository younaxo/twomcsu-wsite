import type { ReportAppealedMinecraftPunishmentDto } from '@twomc/shared';
import { StatusBadge } from '@/components/punishments/punishment-ui';
import { formatDateTime } from '@/lib/format';
import { KIND_LABELS } from '@/lib/punishments/view';

/// Наказание сервера, которое обжалуется (l1-02): только для персонала.
/// Ник нарушителя показываем здесь, в публичные списки он не попадает.
/// Выдавший, причина, uuid и IP в этом виде отсутствуют намеренно.
export function AppealedMcPunishment({
  punishment,
  compact = false,
}: {
  punishment: ReportAppealedMinecraftPunishmentDto;
  compact?: boolean;
}) {
  const kind = KIND_LABELS[punishment.kind] ?? punishment.kind;
  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        data-testid="appealed-mc-punishment-compact"
      >
        <span className="font-mono">{punishment.ref}</span>
        <StatusBadge status={punishment.status} />
      </span>
    );
  }
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border border-border p-3 text-xs"
      data-testid="appealed-mc-punishment"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Обжалуется наказание сервера: {kind}</span>
        <span className="font-mono text-muted-foreground">{punishment.ref}</span>
        <StatusBadge status={punishment.status} />
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
        {punishment.subjectName ? (
          <div>
            <dt className="inline">Игрок: </dt>
            <dd className="inline">{punishment.subjectName}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline">Выдано: </dt>
          <dd className="inline">
            <time dateTime={punishment.startedAt}>{formatDateTime(punishment.startedAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="inline">До: </dt>
          <dd className="inline">
            {punishment.until ? (
              <time dateTime={punishment.until}>{formatDateTime(punishment.until)}</time>
            ) : (
              'бессрочно'
            )}
          </dd>
        </div>
        {punishment.removedAt ? (
          <div>
            <dt className="inline">Снято: </dt>
            <dd className="inline">
              <time dateTime={punishment.removedAt}>{formatDateTime(punishment.removedAt)}</time>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
