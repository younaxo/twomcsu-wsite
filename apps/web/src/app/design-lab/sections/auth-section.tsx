'use client';

import type { ExternalProvider, SocialAuthMode, SocialResultStatus } from '@twomc/shared';
import { Suspense, useState } from 'react';
import { LoginForm } from '@/app/(auth)/login/login-form';
import { RegisterForm } from '@/app/(auth)/register/register-form';
import { AuthPanel } from '@/components/auth/auth-layout';
import { AuthTutorial, TutorialStepView } from '@/components/auth/auth-tutorial';
import { MinecraftLinkStep } from '@/components/auth/minecraft-link-step';
import { Button } from '@/components/ui/button';
import { TUTORIAL_STEPS } from '@/lib/auth/tutorial';
import { SocialAuthResult } from '@/components/auth/social-auth-result';
import { SegmentedControl } from '@/components/ui/segmented-control';

type View =
  'login' | 'register' | 'otp' | 'mc-code' | 'mc-confirm' | 'success' | 'tutorial' | 'result';

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
  const [tutorialStep, setTutorialStep] = useState(TUTORIAL_STEPS[0]!.id);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const stepIndex = Math.max(
    0,
    TUTORIAL_STEPS.findIndex((item) => item.id === tutorialStep),
  );
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
            { value: 'mc-code', label: 'Код Minecraft' },
            { value: 'mc-confirm', label: 'Подтверждение в игре' },
            { value: 'success', label: 'Готово' },
            { value: 'tutorial', label: 'Tutorial' },
            { value: 'result', label: 'Discord / Telegram' },
          ]}
        />
        {view === 'tutorial' ? (
          <>
            <SegmentedControl
              size="sm"
              value={tutorialStep}
              onValueChange={setTutorialStep}
              options={TUTORIAL_STEPS.map((item, i) => ({ value: item.id, label: `${i + 1}` }))}
            />
            <Button size="sm" variant="secondary" onClick={() => setTutorialOpen(true)}>
              Открыть окно tutorial
            </Button>
          </>
        ) : null}
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
          ) : view === 'mc-code' ? (
            <AuthPanel mode="register">
              <RegisterForm key="minecraft" previewStep="minecraft" />
            </AuthPanel>
          ) : view === 'mc-confirm' ? (
            <AuthPanel mode="register">
              <div className="flex flex-col gap-2">
                <h3 className="font-display text-2xl font-bold leading-tight tracking-tight">
                  Подтвердите Minecraft
                </h3>
                <p className="text-sm text-muted-foreground">
                  Код ниже — пример формата для превью; реальный выдаёт сервер.
                </p>
              </div>
              <MinecraftLinkStep
                preview
                verificationId="design-lab-preview"
                completionToken="design-lab-preview"
                username="player"
                initialChallenge={{
                  name: 'player',
                  confirmed: false,
                  challenge: 'X0XX0',
                  challengeExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
                }}
                onConfirmed={() => undefined}
              />
            </AuthPanel>
          ) : view === 'success' ? (
            <AuthPanel mode="register">
              <RegisterForm key="create" previewStep="create" />
            </AuthPanel>
          ) : view === 'tutorial' ? (
            <div className="w-full max-w-[56rem] rounded-xl bg-surface-overlay p-6 shadow-xl">
              <TutorialStepView
                step={TUTORIAL_STEPS[stepIndex]!}
                index={stepIndex}
                total={TUTORIAL_STEPS.length}
                standalone
              />
            </div>
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
      <AuthTutorial open={tutorialOpen} onOpenChange={setTutorialOpen} />
    </div>
  );
}
