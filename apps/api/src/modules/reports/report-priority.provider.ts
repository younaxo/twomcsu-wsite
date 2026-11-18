import { Report, ReportType } from '@prisma/client';

export type ReportPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const REPORT_PRIORITIES: readonly ReportPriority[] = [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
];

/// DI-токен точки расширения приоритета обращений.
export const REPORT_PRIORITY_PROVIDER = Symbol('REPORT_PRIORITY_PROVIDER');

/// Достаточно полей, по которым можно вычислить приоритет. `authorId` нужен
/// будущей реализации на основе entitlements автора (Heracles/Poseidon/Zeus),
/// сейчас не используется.
export type ReportPriorityInput = Pick<Report, 'type' | 'status' | 'authorId'>;

/// Приоритет в схеме не хранится (schema.prisma не менялась) — он вычисляется
/// на сервере и отдаётся только персоналу.
export interface ReportPriorityProvider {
  resolve(
    report: ReportPriorityInput,
  ): ReportPriority | Promise<ReportPriority>;
  /// Обратное отображение для фильтра очереди: какие типы обращений имеют
  /// указанный приоритет. Реализация на entitlements, которая не выражается
  /// типом, должна расширить это место отдельным решением.
  typesForPriority(priority: ReportPriority): ReportType[];
}

const PRIORITY_BY_TYPE: Record<ReportType, ReportPriority> = {
  PLAYER_COMPLAINT: 'NORMAL',
  ADMIN_COMPLAINT: 'HIGH',
  PUNISHMENT_APPEAL: 'HIGH',
  TECHNICAL_ISSUE: 'NORMAL',
  DONATION_PROBLEM: 'HIGH',
  OTHER: 'NORMAL',
};

/// Чистая функция приоритета по типу обращения.
export function defaultReportPriority(type: ReportType): ReportPriority {
  return PRIORITY_BY_TYPE[type] ?? 'NORMAL';
}

export class DefaultReportPriorityProvider implements ReportPriorityProvider {
  resolve(report: ReportPriorityInput): ReportPriority {
    return defaultReportPriority(report.type);
  }

  typesForPriority(priority: ReportPriority): ReportType[] {
    return (Object.keys(PRIORITY_BY_TYPE) as ReportType[]).filter(
      (type) => PRIORITY_BY_TYPE[type] === priority,
    );
  }
}
