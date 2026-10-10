'use client';

import type { TwoFactorBackupCodesDto, TwoFactorSetupDto, TwoFactorStatusDto } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Download, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { OtpInput } from '@/components/ui/otp-input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { formatDate } from '@/lib/format';

/// «Двухфакторная аутентификация» в «Настройки → Безопасность» (ADR-0109):
/// статус, включение (QR + ручной ключ + первый код), резервные коды — показ
/// один раз с копированием и скачиванием, новые коды и отключение (пароль +
/// код). Сервер без ключа шифрования — честное «недоступно».

export const TWO_FACTOR_KEY = ['account', 'two-factor'] as const;
const LOW_BACKUP_CODES = 3;

export function useTwoFactorStatus() {
  return useQuery({
    queryKey: TWO_FACTOR_KEY,
    queryFn: () => api.get<TwoFactorStatusDto>('/auth/2fa'),
  });
}

/// QR-код из otpauth URI — SVG рисуется в браузере (секрет не уходит третьим
/// сервисам). Светлая подложка всегда: тёмный QR читают не все камеры.
function QrCode({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode').then(({ toString }) =>
      toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((svg) => {
        if (alive) setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      }),
    );
    return () => {
      alive = false;
    };
  }, [value]);
  if (!src) return <Skeleton className="size-44 rounded-lg" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- локальный data: URL
    <img
      src={src}
      alt="QR-код для приложения-аутентификатора"
      className="size-44 rounded-lg bg-white p-2"
      data-testid="two-factor-qr"
    />
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Не удалось скопировать — выделите текст вручную.');
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Скопировано' : label}
    </Button>
  );
}

/// Резервные коды — показываются ОДИН раз; закрыть можно, только отметив,
/// что коды сохранены.
export function BackupCodesDialog({
  codes,
  onClose,
}: {
  codes: string[] | null;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const text = codes?.join('\n') ?? '';
  const download = () => {
    const blob = new Blob([`Резервные коды twomc.su (каждый — один раз)\n\n${text}\n`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'twomc-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog
      open={codes !== null}
      onOpenChange={(open) => {
        if (!open && saved) {
          setSaved(false);
          onClose();
        }
      }}
    >
      <DialogContent size="sm" hideClose data-testid="backup-codes-dialog">
        <DialogHeader>
          <DialogTitle>Резервные коды</DialogTitle>
          <DialogDescription>
            Если телефон потеряется, войти можно одним из этих кодов. Каждый код работает один раз.
            Сохраните их сейчас — больше они показаны не будут.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <ul
            className="grid grid-cols-2 gap-2 rounded-lg bg-surface-sunken p-3 font-mono text-sm"
            data-testid="backup-codes"
          >
            {codes?.map((code) => (
              <li key={code} className="text-center tabular-nums">
                {code}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={text} label="Скопировать" />
            <Button type="button" size="sm" variant="secondary" onClick={download}>
              <Download />
              Скачать .txt
            </Button>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              checked={saved}
              onCheckedChange={(value) => setSaved(value === true)}
              aria-label="Я сохранил(а) резервные коды"
            />
            <span>Я сохранил(а) резервные коды в надёжном месте</span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            disabled={!saved}
            onClick={() => {
              setSaved(false);
              onClose();
            }}
          >
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnableDialog({
  open,
  onOpenChange,
  onEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabled: (codes: string[]) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setup = useMutation({
    mutationFn: () => api.post<TwoFactorSetupDto>('/auth/2fa/setup'),
    onError: (failure) => setError(getErrorMessage(failure)),
  });
  const enable = useMutation({
    mutationFn: (value: string) =>
      api.post<TwoFactorBackupCodesDto>('/auth/2fa/enable', { code: value }),
    onSuccess: (data) => {
      setCode('');
      onEnabled(data.backupCodes);
    },
    onError: (failure) => {
      setCode('');
      setError(getErrorMessage(failure));
    },
  });
  const { mutate: startSetup, reset: resetSetup } = setup;

  // Новый секрет на каждое открытие окна.
  useEffect(() => {
    if (open) {
      setError(null);
      setCode('');
      startSetup();
    } else {
      resetSetup();
    }
  }, [open, startSetup, resetSetup]);

  const submit = (value: string) => {
    if (value.length !== 6 || enable.isPending) return;
    setError(null);
    enable.mutate(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" data-testid="two-factor-enable-dialog">
        <DialogHeader>
          <DialogTitle>Включить двухфакторную аутентификацию</DialogTitle>
          <DialogDescription>
            Отсканируйте QR-код в приложении-аутентификаторе (Google Authenticator, Aegis, 1Password
            и др.) и введите код из него.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {setup.data ? (
            <>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <QrCode value={setup.data.otpauthUri} />
                <div className="flex min-w-0 flex-col gap-2 text-sm">
                  <p className="text-muted-foreground">Нет камеры? Введите ключ вручную:</p>
                  <code
                    className="break-all rounded bg-surface-sunken px-2 py-1.5 font-mono text-xs"
                    data-testid="two-factor-secret"
                  >
                    {setup.data.secret.replace(/(.{4})/g, '$1 ').trim()}
                  </code>
                  <div>
                    <CopyButton value={setup.data.secret} label="Скопировать ключ" />
                  </div>
                </div>
              </div>
              <Field label="Код из приложения" error={error}>
                <OtpInput
                  length={6}
                  value={code}
                  onChange={setCode}
                  onComplete={submit}
                  invalid={error !== null}
                  loading={enable.isPending}
                  autoFocus
                />
              </Field>
            </>
          ) : error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            <Skeleton className="h-44 w-full rounded-lg" />
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={!setup.data || code.length !== 6}
            loading={enable.isPending}
            onClick={() => submit(code)}
          >
            <ShieldCheck />
            Включить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({
  open,
  onOpenChange,
  onDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisabled: () => void;
}) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const disable = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable', { password, code: code.trim() }),
    onSuccess: () => {
      setPassword('');
      setCode('');
      onDisabled();
    },
    onError: (failure) => setError(getErrorMessage(failure)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPassword('');
          setCode('');
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm" data-testid="two-factor-disable-dialog">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            disable.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Отключить двухфакторную аутентификацию?</DialogTitle>
            <DialogDescription>
              Аккаунт снова будет защищён только паролем. Подтвердите паролем и кодом из приложения
              (или резервным кодом).
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Пароль" required>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="Код из приложения или резервный код" required error={error}>
              <Input
                autoComplete="one-time-code"
                spellCheck={false}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              type="submit"
              variant="destructive"
              loading={disable.isPending}
              disabled={password === '' || code.trim().length < 6}
            >
              <ShieldOff />
              Отключить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateDialog({
  open,
  onOpenChange,
  onCodes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCodes: (codes: string[]) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const regenerate = useMutation({
    mutationFn: (value: string) =>
      api.post<TwoFactorBackupCodesDto>('/auth/2fa/backup-codes', { code: value }),
    onSuccess: (data) => {
      setCode('');
      onCodes(data.backupCodes);
    },
    onError: (failure) => {
      setCode('');
      setError(getErrorMessage(failure));
    },
  });
  const submit = (value: string) => {
    if (value.length !== 6 || regenerate.isPending) return;
    setError(null);
    regenerate.mutate(value);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCode('');
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm" data-testid="two-factor-regenerate-dialog">
        <DialogHeader>
          <DialogTitle>Новые резервные коды</DialogTitle>
          <DialogDescription>
            Прежние резервные коды перестанут работать. Подтвердите кодом из приложения.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Код из приложения" error={error}>
            <OtpInput
              length={6}
              value={code}
              onChange={setCode}
              onComplete={submit}
              invalid={error !== null}
              loading={regenerate.isPending}
              autoFocus
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={code.length !== 6}
            loading={regenerate.isPending}
            onClick={() => submit(code)}
          >
            <KeyRound />
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TwoFactorSettings() {
  const client = useQueryClient();
  const status = useTwoFactorStatus();
  const [dialog, setDialog] = useState<'enable' | 'disable' | 'regenerate' | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: TWO_FACTOR_KEY });
    // `/auth/me` несёт twoFactorEnabled — обновить без перезагрузки.
    void useAuthStore.getState().reload();
  };
  const showCodes = (next: string[]) => {
    setDialog(null);
    setCodes(next);
    refresh();
  };

  const data = status.data;
  return (
    <section
      className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm"
      aria-label="Двухфакторная аутентификация"
      data-testid="two-factor-settings"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Двухфакторная аутентификация</h3>
        {data?.enabled ? <Badge tone="success">Включена</Badge> : null}
      </div>
      {status.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : status.isError || !data ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(status.error)}
        </p>
      ) : !data.available ? (
        <p className="text-sm text-muted-foreground" data-testid="two-factor-unavailable">
          Двухфакторная аутентификация пока недоступна: сервер ещё не настроен для неё.
        </p>
      ) : data.enabled ? (
        <>
          <p className="text-sm text-muted-foreground">
            При входе, кроме пароля, нужен код из приложения-аутентификатора.
            {data.enabledAt ? ` Включена ${formatDate(data.enabledAt)}.` : null}
          </p>
          <p
            className={
              data.backupCodesRemaining <= LOW_BACKUP_CODES
                ? 'rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning'
                : 'text-sm text-muted-foreground'
            }
            data-testid="backup-codes-remaining"
          >
            Резервных кодов осталось: {data.backupCodesRemaining}.
            {data.backupCodesRemaining <= LOW_BACKUP_CODES
              ? ' Создайте новые, пока есть доступ.'
              : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDialog('regenerate')}>
              <KeyRound />
              Новые резервные коды
            </Button>
            <Button variant="ghost" onClick={() => setDialog('disable')}>
              <ShieldOff />
              Отключить
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Защитите аккаунт: при входе, кроме пароля, понадобится код из приложения на телефоне.
            Вход через Discord или Telegram тоже потребует код.
          </p>
          <div>
            <Button onClick={() => setDialog('enable')}>
              <ShieldCheck />
              Включить
            </Button>
          </div>
        </>
      )}
      <EnableDialog
        open={dialog === 'enable'}
        onOpenChange={(open) => setDialog(open ? 'enable' : null)}
        onEnabled={(next) => {
          toast.success('Двухфакторная аутентификация включена');
          showCodes(next);
        }}
      />
      <RegenerateDialog
        open={dialog === 'regenerate'}
        onOpenChange={(open) => setDialog(open ? 'regenerate' : null)}
        onCodes={showCodes}
      />
      <DisableDialog
        open={dialog === 'disable'}
        onOpenChange={(open) => setDialog(open ? 'disable' : null)}
        onDisabled={() => {
          setDialog(null);
          toast.success('Двухфакторная аутентификация отключена');
          refresh();
        }}
      />
      <BackupCodesDialog codes={codes} onClose={() => setCodes(null)} />
    </section>
  );
}
