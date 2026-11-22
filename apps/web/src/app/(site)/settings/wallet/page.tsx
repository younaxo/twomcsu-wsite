'use client';

import { WalletCards } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { Card } from '@/components/ui/card';
import { CurrencyIcon } from '@/components/ui/currency-icon';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { useWallet } from '@/lib/account/hooks';
import { formatDateTime } from '@/lib/format';
import {
  RUBY_DISCLAIMER,
  WALLET_PAGE_SIZE,
  formatRuby,
  isWalletDisabled,
  shortOrderId,
  useMyWalletHistory,
  walletKindLabel,
  type WalletEntry,
} from '@/lib/wallet/wallet';
import { cn } from '@/lib/cn';

const COLUMNS: DataGridColumn<WalletEntry>[] = [
  {
    key: 'operation',
    header: 'Операция',
    cell: (entry) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{walletKindLabel(entry.kind)}</span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(entry.createdAt)}
          {entry.orderId ? (
            <span title={entry.orderId}> · Заказ #{shortOrderId(entry.orderId)}</span>
          ) : null}
        </span>
      </div>
    ),
  },
  {
    key: 'amount',
    header: 'Сумма',
    align: 'right',
    cell: (entry) => {
      const negative = entry.amount.startsWith('-');
      return (
        <span
          className={cn(
            'font-mono tabular font-medium',
            negative ? 'text-destructive' : 'text-success',
          )}
          data-testid="wallet-entry-amount"
        >
          {formatRuby(entry.amount, true)}
        </span>
      );
    },
  },
  {
    key: 'balanceAfter',
    header: 'Баланс после',
    align: 'right',
    hideOnMobile: true,
    cell: (entry) => <span className="font-mono tabular">{formatRuby(entry.balanceAfter)}</span>,
  },
];

function WalletContent() {
  const [page, setPage] = useState(1);
  const history = useMyWalletHistory(page);
  const balance = useWallet(true);
  const ruby = balance.data?.balances?.find((item) => item.currency === 'RUBY');

  if (isWalletDisabled(history.error)) {
    return (
      <Card>
        <EmptyState
          icon={<WalletCards />}
          title="Кошелёк пока недоступен"
          description="Раздел временно выключен. Баланс и история появятся, когда его включат."
          data-testid="wallet-disabled"
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-1" aria-label="Баланс рубинов">
        <p className="text-sm text-muted-foreground">Баланс рубинов</p>
        <p
          className="flex items-center gap-2 font-display text-3xl font-bold tabular"
          data-testid="wallet-balance"
        >
          <CurrencyIcon currency="RUBY" scale={2} />
          <span>{ruby ? formatRuby(ruby.amountMinor) : '—'}</span>
        </p>
        <p className="text-sm text-muted-foreground" data-testid="wallet-disclaimer">
          {RUBY_DISCLAIMER}
        </p>
      </Card>

      <section aria-labelledby="wallet-history-title" className="flex flex-col gap-3">
        <h2 id="wallet-history-title" className="text-lg font-semibold">
          История операций
        </h2>
        <DataGrid
          columns={COLUMNS}
          rows={history.data?.items ?? []}
          getRowId={(entry) => entry.id}
          loading={history.isPending}
          error={history.isError ? history.error : undefined}
          onRetry={() => history.refetch()}
          emptyTitle="Операций пока нет"
          emptyDescription="Здесь появятся покупки и возвраты, связанные с рубинами."
          caption="История рубинов: операция, сумма, баланс после"
          pagination={
            history.data
              ? {
                  page,
                  limit: WALLET_PAGE_SIZE,
                  total: history.data.total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      </section>
    </div>
  );
}

/// «Настройки → Кошелёк»: баланс рубинов и журнал операций (0.15). Только чтение:
/// ни трат, ни передачи, ни вывода.
export default function WalletSettingsPage() {
  return (
    <>
      <PageHeader title="Кошелёк" description="Баланс рубинов и история операций." />
      <RequireSession>
        <WalletContent />
      </RequireSession>
    </>
  );
}
