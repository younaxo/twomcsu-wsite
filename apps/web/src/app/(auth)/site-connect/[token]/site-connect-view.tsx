'use client';

import type { SiteConnectOpenResponse } from '@twomc/shared';
import { Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

const ERRORS: Record<string, { title: string; text: string }> = {
  link_invalid: {
    title: 'Ссылка недействительна',
    text: 'Введите /site-connect в игре ещё раз и откройте новую ссылку.',
  },
  link_used: {
    title: 'Ссылка уже использована',
    text: 'Код по этой ссылке уже принят. Для новой привязки введите /site-connect ещё раз.',
  },
  link_expired: {
    title: 'Срок ссылки истёк',
    text: 'Ссылка действует 10 минут. Введите /site-connect в игре ещё раз.',
  },
};

function errorCode(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const body = error.body as { code?: unknown; message?: unknown };
    if (typeof body.code === 'string') return body.code;
    if (body.message && typeof body.message === 'object') {
      const code = (body.message as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
  }
  return 'error';
}

/// /site-connect/<token> — ссылка из чата Minecraft (ADR-0072): показывает
/// Код привязки XXX-000-X0X0-0X0 (16 символов), который вставляют в регистрацию. Каждое открытие выдаёт
/// новый код (прежний перестаёт действовать), поэтому запрос — ровно один.
export function SiteConnectView({ token }: { token: string }) {
  const [result, setResult] = useState<SiteConnectOpenResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    api
      .post<SiteConnectOpenResponse>(
        '/minecraft/site-connect/open',
        { token },
        { auth: false, retryOn401: false },
      )
      .then(setResult)
      .catch((error) => setFailure(errorCode(error)));
  }, [token]);

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Не удалось скопировать — выделите код вручную.');
    }
  };

  if (failure) {
    const copy = ERRORS[failure] ?? {
      title: 'Не удалось открыть ссылку',
      text: 'Попробуйте ещё раз немного позже.',
    };
    return (
      <AuthShell title={copy.title} description={copy.text}>
        <Button asChild size="lg" variant="secondary">
          <Link href="/register">Вернуться к регистрации</Link>
        </Button>
      </AuthShell>
    );
  }

  if (!result) {
    return (
      <AuthShell title="Код привязки Minecraft" description="Получаем код…">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Проверяем ссылку из игры…
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Код привязки Minecraft"
      description={`Для игрока ${result.name}. Скопируйте код и вставьте его в регистрации.`}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-sunken px-4 py-4"
        data-testid="site-connect-code"
      >
        <p className="break-all font-mono text-2xl font-bold tracking-[0.18em]">{result.code}</p>
        <Button onClick={() => void copy()} variant="secondary">
          {copied ? <Check className="text-success" /> : <Copy />}
          {copied ? 'Скопировано' : 'Скопировать'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Код одноразовый и действует до{' '}
        {new Date(result.expiresAt).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })}
        . Никому его не передавайте.
      </p>
      <Button asChild size="lg">
        <Link href="/register">Вернуться к регистрации</Link>
      </Button>
    </AuthShell>
  );
}
