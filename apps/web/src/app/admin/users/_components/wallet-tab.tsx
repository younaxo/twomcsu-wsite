'use client';

import type { AdminUserFull } from '@twomc/shared';
import { TriangleAlert, WalletCards } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { FormErrorSummary, FormField, useFocusFirstInvalid } from '@/components/admin/form-field';
import { PageSection } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CurrencyIcon } from '@/components/ui/currency-icon';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/auth/store';
import { usePermissions } from '@/lib/auth/use-permissions';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import {
  RUBY_DISCLAIMER,
  WALLET_PAGE_SIZE,
  WALLET_REASON_MAX,
  describeAdjustError,
  formatRuby,
  isWalletDisabled,
  newRequestId,
  normalizeAdjustAmount,
  shortOrderId,
  useAdjustWallet,
  useAdminWallet,
  validateAdjustCode,
  validateAdjustDetails,
  walletKindLabel,
  type AdjustErrorInfo,
  type AdjustFormErrors,
  type WalletEntry,
} from '@/lib/wallet/wallet';

/// Вкладка «Кошелёк» карточки пользователя (0.15, ADR-0191): баланс и журнал
/// рубинов по праву `wallet.view`; ручная корректировка по `wallet.adjust`
/// (причина, свежий код 2FA, подтверждение; лимиты и запрет «своего» кошелька
/// проверяет сервер, UI только объясняет коды).
export const WALLET_TAB_REQUIREMENT = 'wallet.view';

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
        {entry.reason ? (
          <span className="text-xs text-muted-foreground">Причина: {entry.reason}</span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'amount',
    header: 'Сумма',
    align: 'right',
    cell: (entry) => (
      <span
        className={cn(
          'font-mono tabular font-medium',
          entry.amount.startsWith('-') ? 'text-destructive' : 'text-success',
        )}
        data-testid="wallet-entry-amount"
      >
        {formatRuby(entry.amount, true)}
      </span>
    ),
  },
  {
    key: 'balanceAfter',
    header: 'Баланс после',
    align: 'right',
    hideOnMobile: true,
    cell: (entry) => <span className="font-mono tabular">{formatRuby(entry.balanceAfter)}</span>,
  },
  {
    key: 'actor',
    header: 'Кем',
    hideOnMobile: true,
    cell: (entry) =>
      entry.actorId ? (
        <Link href={`/admin/users/${entry.actorId}`} className="font-mono text-xs underline">
          {entry.actorId.slice(-8)}
        </Link>
      ) : (
        <span className="text-muted-foreground">система</span>
      ),
  },
];

type Step = 'details' | 'confirm';

function AdjustDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUserFull;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mutation = useAdjustWallet(user.id);
  const [step, setStep] = useState<Step>('details');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<AdjustFormErrors>({});
  const [failure, setFailure] = useState<AdjustErrorInfo | null>(null);
  const requestId = useRef(newRequestId());
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();

  const normalized = normalizeAdjustAmount(amount);
  const credit = normalized !== null && !normalized.startsWith('-');

  const reset = () => {
    setStep('details');
    setAmount('');
    setReason('');
    setCode('');
    setErrors({});
    setFailure(null);
    requestId.current = newRequestId();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setFailure(null);
    if (step === 'details') {
      const problems = validateAdjustDetails({ amount, reason });
      setErrors(problems);
      if (Object.keys(problems).length > 0) {
        focusFirstInvalid();
        return;
      }
      // Новое подтверждение — новый ключ повтора (иначе смена суммы даст конфликт).
      requestId.current = newRequestId();
      setStep('confirm');
      return;
    }
    const problems = validateAdjustCode(code);
    setErrors(problems);
    if (Object.keys(problems).length > 0 || normalized === null) {
      focusFirstInvalid();
      return;
    }
    mutation.mutate(
      {
        amount: normalized,
        reason: reason.trim(),
        twoFactorCode: code.trim(),
        requestId: requestId.current,
      },
      {
        onSuccess: (result) => {
          toast.success(
            result.replayed
              ? 'Корректировка уже была выполнена'
              : `Корректировка выполнена. Баланс: ${formatRuby(result.balance)}`,
          );
          reset();
          onOpenChange(false);
        },
        onError: (error) => {
          const info = describeAdjustError(error);
          setFailure(info);
          // Код 2FA одноразовый: после любой ошибки просим новый.
          setCode('');
          if (info.field === 'amount' || info.field === 'reason') {
            setStep('details');
            setErrors({ [info.field]: info.message });
            focusFirstInvalid();
          } else if (info.field === 'twoFactorCode') {
            setErrors({ twoFactorCode: info.message });
            focusFirstInvalid();
          } else {
            setErrors({});
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="sm"
        onEscapeKeyDown={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <form ref={containerRef} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Корректировка рубинов: {user.username}</DialogTitle>
            <DialogDescription>
              {step === 'details'
                ? 'Укажите сумму со знаком и причину. Операция попадёт в журнал аудита.'
                : 'Проверьте данные и введите код 2FA.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {failure ? (
              <FormErrorSummary data-testid="adjust-error">
                {failure.message}{' '}
                {failure.needsTwoFactorSetup ? (
                  <Link href="/settings/security" className="font-medium underline">
                    Включить 2FA
                  </Link>
                ) : null}
              </FormErrorSummary>
            ) : null}
            {step === 'details' ? (
              <>
                <FormField
                  label="Сумма, рубины"
                  required
                  error={errors.amount}
                  hint="Целое число: + начислить, - списать. Потолок и суточный лимит задаёт сервер."
                >
                  <Input
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="+500"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      if (errors.amount) setErrors({ ...errors, amount: undefined });
                    }}
                    className="font-mono"
                  />
                </FormField>
                <FormField
                  label="Причина"
                  required
                  error={errors.reason}
                  hint={`До ${WALLET_REASON_MAX} символов, сохраняется в аудите`}
                >
                  <Textarea
                    rows={3}
                    maxLength={WALLET_REASON_MAX}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (errors.reason) setErrors({ ...errors, reason: undefined });
                    }}
                  />
                </FormField>
              </>
            ) : (
              <>
                <div
                  role="note"
                  data-testid="adjust-summary"
                  className="flex gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning"
                >
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <p>
                    {credit ? 'Начислить' : 'Списать'}{' '}
                    <strong>{formatRuby(normalized?.replace('-', '') ?? '')}</strong> рубинов
                    пользователю {user.username}. Причина: {reason.trim()}. Действие необратимо и
                    записывается в аудит как критическое.
                  </p>
                </div>
                <FormField
                  label="Код 2FA"
                  required
                  error={errors.twoFactorCode}
                  hint="Свежий код из приложения-аутентификатора. Резервные коды не подходят."
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\s/g, ''));
                      if (errors.twoFactorCode) setErrors({ ...errors, twoFactorCode: undefined });
                    }}
                    className="font-mono"
                  />
                </FormField>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            {step === 'confirm' ? (
              <Button
                type="button"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() => {
                  setStep('details');
                  setCode('');
                  setErrors({});
                  setFailure(null);
                }}
              >
                Назад
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Отмена
              </Button>
            )}
            <Button
              type="submit"
              variant={step === 'confirm' && !credit ? 'destructive' : 'primary'}
              loading={mutation.isPending}
              disabled={mutation.isPending}
            >
              {step === 'details' ? 'Далее' : credit ? 'Начислить' : 'Списать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WalletTab({ user }: { user: AdminUserFull }) {
  const { can } = usePermissions();
  const canAdjust = can('wallet.adjust');
  const isSelf = useAuthStore((state) => state.user?.id === user.id);
  const [page, setPage] = useState(1);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const query = useAdminWallet(user.id, page, can('wallet.view'));
  const view = query.data;

  if (isWalletDisabled(query.error)) {
    return (
      <Card>
        <EmptyState
          icon={<WalletCards />}
          title="Кошелёк выключен"
          description="Серверный флаг кошелька не включён: баланс и корректировки недоступны."
          data-testid="wallet-disabled"
        />
      </Card>
    );
  }

  return (
    <PageSection
      title="Кошелёк рубинов"
      description={RUBY_DISCLAIMER}
      actions={
        canAdjust ? (
          <Button
            size="sm"
            onClick={() => setAdjustOpen(true)}
            disabled={isSelf || !view}
            title={isSelf ? 'Нельзя корректировать собственный кошелёк' : undefined}
          >
            Корректировка
          </Button>
        ) : null
      }
    >
      <Card className="flex flex-col gap-2" aria-label="Баланс рубинов">
        <p className="text-sm text-muted-foreground">Баланс по журналу</p>
        <p
          className="flex items-center gap-2 font-display text-3xl font-bold tabular"
          data-testid="wallet-balance"
        >
          <CurrencyIcon currency="RUBY" scale={2} />
          <span>{view ? formatRuby(view.balance) : '—'}</span>
        </p>
        {view && !view.consistent ? (
          <p
            role="alert"
            data-testid="wallet-inconsistent"
            className="rounded-lg bg-warning-soft p-2 text-sm text-warning"
          >
            Баланс кошелька не совпадает с журналом. Корректировки могут быть отклонены, нужен
            разбор.
          </p>
        ) : null}
        {canAdjust && isSelf ? (
          <p className="text-sm text-muted-foreground">
            Свой кошелёк корректировать нельзя: попросите другого администратора.
          </p>
        ) : null}
      </Card>

      <DataGrid
        columns={COLUMNS}
        rows={view?.history.items ?? []}
        getRowId={(entry) => entry.id}
        loading={query.isPending}
        error={query.isError ? query.error : undefined}
        onRetry={() => query.refetch()}
        emptyTitle="Операций нет"
        emptyDescription="Журнал рубинов пуст."
        caption="Журнал рубинов: операция, сумма, баланс после, кем выполнена"
        pagination={
          view
            ? {
                page,
                limit: WALLET_PAGE_SIZE,
                total: view.history.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />

      {canAdjust ? (
        <AdjustDialog user={user} open={adjustOpen} onOpenChange={setAdjustOpen} />
      ) : null}
    </PageSection>
  );
}
