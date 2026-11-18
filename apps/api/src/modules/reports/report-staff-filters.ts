import { Prisma, ReportType } from '@prisma/client';
import { StaffListReportsQueryDto } from './dto/staff-list-reports-query.dto';
import { ReportPriorityProvider } from './report-priority.provider';

/// Условия очереди персонала (общие для активного и архивного списка).
/// `isArchived` задаёт вызывающий.
export function buildStaffReportWhere(
  query: StaffListReportsQueryDto,
  actorId: string,
  priority: ReportPriorityProvider,
): Prisma.ReportWhereInput {
  const and: Prisma.ReportWhereInput[] = [];

  if (query.status) {
    and.push({ status: query.status });
  }

  let types: ReportType[] | undefined = query.type ? [query.type] : undefined;
  if (query.priority) {
    const byPriority = priority.typesForPriority(query.priority);
    types = types ? types.filter((t) => byPriority.includes(t)) : byPriority;
  }
  if (types) {
    and.push({ type: { in: types } });
  }

  if (query.assignedToId === 'unassigned') {
    and.push({ assignedToId: null });
  } else if (query.assignedToId === 'me') {
    and.push({ assignedToId: actorId });
  } else if (query.assignedToId) {
    and.push({ assignedToId: query.assignedToId });
  }

  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' as const };
    and.push({
      OR: [
        { reportNumber: contains },
        { description: contains },
        { targets: { some: { username: contains } } },
        { author: { username: contains } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}
