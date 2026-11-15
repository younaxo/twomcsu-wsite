'use client';

import { LifeBuoy, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonRows } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import {
  REPORT_STATUS_LABEL,
  REPORT_TYPES,
  REPORT_TYPE_ORDER,
  reportTypeLabel,
  useMyReports,
} from '@/lib/support/hooks';

/// «Обращения» (срез 3.5, ADR-0120): свои обращения и создание нового по типу.
function MyReports() {
  const [page, setPage] = useState(1);
  const reports = useMyReports({ page, limit: 20 });
  if (reports.isPending) return <SkeletonRows rows={4} />;
  if (reports.isError)
    return <ErrorState error={reports.error} onRetry={() => reports.refetch()} />;
  const items = reports.data.items ?? [];
  const totalPages = Math.max(1, Math.ceil(reports.data.total / reports.data.limit));
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<LifeBuoy />}
        title="Обращений пока нет"
        description="Если что-то случилось — создайте обращение, администрация ответит здесь."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul
        className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
        data-testid="my-reports"
      >
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/support/${encodeURIComponent(item.reportNumber)}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <span className="font-mono text-xs text-muted-foreground">#{item.reportNumber}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {reportTypeLabel(item.type)}
              </span>
              <Badge tone={item.status === 'WAITING_RESPONSE' ? 'warning' : 'neutral'}>
                {REPORT_STATUS_LABEL[item.status]}
              </Badge>
              <span className="text-xs text-subtle-foreground">{formatDate(item.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      ) : null}
    </div>
  );
}

export default function SupportPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <PageHeader title="Обращения" description="Жалобы, обжалования и вопросы администрации." />
      <RequireSession>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2" data-testid="report-types">
            {REPORT_TYPE_ORDER.map((type) => (
              <Button
                key={type}
                asChild
                variant="secondary"
                className="h-auto justify-start py-3 text-left"
              >
                <Link href={`/support/new/${type.toLowerCase()}`}>
                  <Plus />
                  <span className="flex flex-col">
                    <span className="font-medium">{REPORT_TYPES[type].label}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {REPORT_TYPES[type].description}
                    </span>
                  </span>
                </Link>
              </Button>
            ))}
          </div>
          <h2 className="text-sm font-semibold">Мои обращения</h2>
          <MyReports />
        </div>
      </RequireSession>
    </div>
  );
}
