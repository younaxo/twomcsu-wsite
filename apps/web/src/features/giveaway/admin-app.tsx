'use client';

import { Loader2, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SiteFooter } from '@/components/shell/site-footer';
import { SiteHeader } from '@/components/shell/site-header';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { ShellModeProvider } from '@/lib/site/shell-mode';
import { adminLoginUrl, createHttpAdminApi } from './admin-api';
import { DrawSection } from './admin-draw';
import { AuditSection, PrizesSection, SettingsSection, TicketsSection } from './admin-sections';
import { TestSection } from './admin-test';
import { AdminApiError, type AdminApi, type AdminMode, type AdminSession } from './admin-types';
import { adminErrorText } from './admin-ui';
import { TestBadge } from './test-badge';

/// Литералы process.env: в production условие становится false и ветка с import() вырезается.
const MOCK =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_GIVEAWAY_MOCK === '1';

type Tab = 'draw' | 'tickets' | 'settings' | 'prizes' | 'audit' | 'test';

const TABS: { id: Tab; label: string }[] = [
  { id: 'draw', label: 'Розыгрыш' },
  { id: 'tickets', label: 'Билеты' },
  { id: 'settings', label: 'Настройки' },
  { id: 'prizes', label: 'Призы' },
  { id: 'audit', label: 'Аудит' },
  { id: 'test', label: 'Тест' },
];

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/// Нейтральные тексты отказа входа: не раскрывают, что именно не так (ADR-G003 п. 2.4).
export function loginErrorText(code: string | null): string | null {
  switch (code) {
    case null:
    case '':
      return null;
    case 'not_allowed':
    case 'mfa_required':
      return 'Вход не выполнен: этот аккаунт не может открыть панель. Нужен доступ и включённая двухфакторная защита Discord.';
    case 'login_closed':
      return 'Вход сейчас закрыт.';
    default:
      return 'Вход не выполнен. Попробуйте ещё раз.';
  }
}

function LoginScreen({ error, onLogin }: { error: string | null; onLogin: () => void }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-center text-2xl font-bold text-foreground">Панель розыгрыша</h1>
      {error ? (
        <p
          role="alert"
          data-testid="login-error"
          className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive-soft p-3 text-sm text-foreground"
        >
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      ) : null}
      <Button size="lg" onClick={onLogin}>
        <LogIn />
        Войти через Discord
      </Button>
    </main>
  );
}

export interface AdminPanelProps {
  api: AdminApi;
  session: AdminSession;
  onLogout: () => void;
}

/// Панель после входа: вкладки, переключатель боевой/тест, выход.
export function AdminPanel({ api, session, onLogout }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('draw');
  const [mode, setMode] = useState<AdminMode>('live');
  const [version, setVersion] = useState(0);
  const tabs = TABS.filter((t) => t.id !== 'test' || session.testModeEnabled);
  const effectiveMode: AdminMode = session.testModeEnabled ? mode : 'live';
  const modeless = tab === 'settings' || tab === 'prizes' || tab === 'audit' || tab === 'test';

  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6">
      {effectiveMode === 'test' ? <TestBadge /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">Панель розыгрыша</h1>
        <p className="ml-auto text-sm text-muted-foreground">{session.discordName}</p>
        <Button variant="secondary" onClick={onLogout}>
          <LogOut />
          Выйти
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Разделы" className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={cn(
                'h-control rounded px-3 text-sm font-medium text-foreground hover:bg-muted',
                focusRing,
                tab === t.id && 'bg-primary-soft font-semibold text-primary-soft-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {session.testModeEnabled && !modeless ? (
          <div role="group" aria-label="Режим данных" className="ml-auto flex gap-1">
            {(['live', 'test'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'h-control rounded border border-border-strong px-3 text-sm text-foreground hover:bg-muted',
                  focusRing,
                  mode === m && 'bg-primary text-primary-foreground hover:bg-primary-hover',
                )}
              >
                {m === 'live' ? 'Боевой' : 'Тест'}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {tab === 'draw' ? <DrawSection key={`${effectiveMode}-${version}`} api={api} mode={effectiveMode} /> : null}
      {tab === 'tickets' ? <TicketsSection key={`${effectiveMode}-${version}`} api={api} mode={effectiveMode} /> : null}
      {tab === 'settings' ? <SettingsSection api={api} /> : null}
      {tab === 'prizes' ? <PrizesSection api={api} /> : null}
      {tab === 'audit' ? <AuditSection api={api} /> : null}
      {tab === 'test' && session.testModeEnabled ? (
        <TestSection api={api} onChanged={() => setVersion((n) => n + 1)} />
      ) : null}
    </main>
  );
}

type View =
  | { kind: 'loading' }
  | { kind: 'anon'; error: string | null }
  | { kind: 'ready'; session: AdminSession };

export interface AdminAppProps {
  mainSiteUrl?: string | null;
  /// Для тестов: фабрика клиента вместо реального/мока (получает обработчик 401).
  createApi?: (handlers: { onUnauthorized: () => void }) => AdminApi;
}

/// Клиентская точка входа админки: после редиректа от Discord сразу `GET /admin/session`
/// (cookie SameSite=Strict не приходит с межсайтовой навигацией, ADR-G003 п. 2.4).
export function AdminApp({ mainSiteUrl = null, createApi }: AdminAppProps = {}) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [api, setApi] = useState<AdminApi | null>(null);

  const toLogin = useCallback((error: string | null = null) => {
    setView({ kind: 'anon', error });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const onUnauthorized = () => setView({ kind: 'anon', error: null });
    if (createApi) {
      setApi(createApi({ onUnauthorized }));
    } else if (MOCK) {
      void import('./admin-mock').then((m) => {
        if (!cancelled) setApi(m.createMockAdminApi());
      });
    } else {
      setApi(createHttpAdminApi({ onUnauthorized }));
    }
    return () => {
      cancelled = true;
    };
  }, [createApi]);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const loginError = loginErrorText(params.get('error'));
    if (params.has('error')) {
      params.delete('error');
      const rest = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    }
    api
      .session()
      .then((session) => {
        if (!cancelled) setView({ kind: 'ready', session });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof AdminApiError && error.status !== 401 && error.status !== 403) {
          toast.error(adminErrorText(error));
        }
        toLogin(loginError);
      });
    return () => {
      cancelled = true;
    };
  }, [api, toLogin]);

  const logout = useCallback(() => {
    if (!api) return;
    void api.logout().finally(() => toLogin(null));
  }, [api, toLogin]);

  const body = useMemo(() => {
    if (view.kind === 'loading' || !api) {
      return (
        <main id="main" role="status" className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
          Загружаем…
        </main>
      );
    }
    if (view.kind === 'anon') {
      return (
        <LoginScreen
          error={view.error}
          onLogin={() => window.location.assign(adminLoginUrl())}
        />
      );
    }
    return <AdminPanel api={api} session={view.session} onLogout={logout} />;
  }, [view, api, logout]);

  return (
    <ShellModeProvider value={{ mainSiteUrl, monochromeLogo: mainSiteUrl !== null }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <SiteHeader />
        {body}
        <SiteFooter />
      </div>
    </ShellModeProvider>
  );
}
