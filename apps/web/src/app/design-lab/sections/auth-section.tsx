'use client';

import type { ExternalProvider, SocialAuthMode, SocialResultStatus } from '@twomc/shared';
import { Suspense, useState } from 'react';
import { LoginForm } from '@/app/(auth)/login/login-form';
import { RegisterForm } from '@/app/(auth)/register/register-form';
import { AuthPanel } from '@/components/auth/auth-layout';
import { SocialAuthResult } from '@/components/auth/social-auth-result';
import { SegmentedControl } from '@/components/ui/segmented-control';

type View = 'login' | 'register' | 'otp' | 'result';

const RESULTS: Array<{
  key: string;
  label: string;
  provider: ExternalProvider;
  mode: SocialAuthMode;
  status: SocialResultStatus;
}> = [
  { key: 'dc-ok', label: 'Discord · вход', provider: 'discord', mode: 'login', status: 'success' },
  {
    key: 'tg-unlinked',
    label: 'Telegram · не привязан',
    provider: 'telegram',
    mode: 'login',
    status: 'not_linked',
  },
  {
    key: 'tg-error',
    label: 'Telegram · ошибка',
    provider: 'telegram',
    mode: 'login',
    status: 'error',
  },
  {
    key: 'dc-link',
    label: 'Discord · подключён',
    provider: 'discord',
    mode: 'link',
    status: 'linked',
  },
  {
    key: 'tg-already',
    label: 'Telegram · уже подключён',
    provider: 'telegram',
    mode: 'link',
    status: 'already_linked',
  },
];

/// Auth в design-lab — те же production-компоненты, что на /login, /register и
/// /auth/result (ADR-0071): панель, переключатель, формы, шаг кода и итог
/// Discord/Telegram. Действия в превью ни к чему не приводят.
export function AuthSection() {
  const [view, setView] = useState<View>('login');
  const [result, setResult] = useState(RESULTS[0]!.key);
  const current = RESULTS.find((item) => item.key === result) ?? RESULTS[0]!;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={view}
          onValueChange={(value) => setView(value as View)}
          options={[
            { value: 'login', label: 'Вход' },
            { value: 'register', label: 'Регистрация' },
            { value: 'otp', label: 'Код подтверждения' },
            { value: 'result', label: 'Discord / Telegram' },
          ]}
        />
        {view === 'result' ? (
          <SegmentedControl
            size="sm"
            value={result}
            onValueChange={setResult}
            options={RESULTS.map((item) => ({ value: item.key, label: item.label }))}
          />
        ) : null}
      </div>
      <div className="flex justify-center rounded-xl bg-background p-4 md:p-8">
        <Suspense fallback={null}>
          {view === 'login' ? (
            <AuthPanel mode="login">
              <LoginForm preview />
            </AuthPanel>
          ) : view === 'register' ? (
            <AuthPanel mode="register">
              <RegisterForm key="details" />
            </AuthPanel>
          ) : view === 'otp' ? (
            <AuthPanel mode="register">
              <RegisterForm key="code" previewStep="code" />
            </AuthPanel>
          ) : (
            <AuthPanel>
              <SocialAuthResult
                key={current.key}
                provider={current.provider}
                mode={current.mode}
                status={current.status}
                autoContinueIn={current.status === 'success' ? 4 : null}
                onPrimary={() => undefined}
                onRetry={() => undefined}
              />
            </AuthPanel>
          )}
        </Suspense>
      </div>
    </div>
  );
}
