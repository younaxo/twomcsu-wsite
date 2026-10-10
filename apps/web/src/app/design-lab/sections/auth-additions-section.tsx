'use client';

import type { ForgotLookupResponse } from '@twomc/shared';
import { useState } from 'react';
import {
  BackToLogin,
  ForgotPasswordForm,
  MaskedEmail,
  RecoveryProviders,
  type ForgotPreview,
} from '@/app/(auth)/forgot-password/forgot-form';
import {
  AuthPanel,
  RegistrationSpotlight,
  SpotlightCoachmark,
} from '@/components/auth/auth-layout';
import { AuthTutorial } from '@/components/auth/auth-tutorial';
import { LinkCodeInput } from '@/components/auth/link-code-input';
import { ScreenshotCarousel } from '@/components/site/screenshot-carousel';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { OtpInput } from '@/components/ui/otp-input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CHALLENGE_PATTERN, LINK_CODE_PATTERN } from '@/lib/auth/minecraft-code';

/// Auth-дополнения (ADR-0092) — production-компоненты: spotlight регистрации,
/// поля кодов Minecraft, «Забыли пароль?» по e-mail и по нику (маска от
/// сервера, недоступные провайдеры), «← Вернуться ко входу». Запросов к API
/// превью не делает.

/// Ответ lookup в том виде, как его отдаёт сервер (маска — пример формата).
const FOUND: ForgotLookupResponse = {
  maskedEmail: 'y***o@i*****.com',
  providers: ['discord', 'telegram'],
};

const FORGOT_STATES: Array<{ value: string; label: string; preview: ForgotPreview }> = [
  { value: 'email', label: 'По e-mail', preview: { mode: 'email' } },
  { value: 'username', label: 'По нику', preview: { mode: 'username' } },
  {
    value: 'found',
    label: 'Аккаунт найден',
    preview: { mode: 'username', username: 'younaxo', lookup: FOUND },
  },
  {
    value: 'found-plain',
    label: 'Без привязок',
    preview: { mode: 'username', username: 'player', lookup: { ...FOUND, providers: [] } },
  },
];

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      {children}
    </div>
  );
}

function SpotlightPreview() {
  const [active, setActive] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  return (
    <Block
      title="Registration Spotlight"
      note="При входе в регистрацию (раз за вкладку, не на «Вход»): затемнение, кнопка над ним, подсказка у кнопки. «Мне понятно», клик по фону и Escape закрывают."
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 shadow-sm">
        <span className="text-sm text-muted-foreground">Шапка auth</span>
        <RegistrationSpotlight
          active={active}
          onDismiss={() => setActive(false)}
          onTutorial={() => {
            setActive(false);
            setTutorial(true);
          }}
        />
      </div>
      <Button size="sm" variant="secondary" className="self-start" onClick={() => setActive(true)}>
        Показать spotlight
      </Button>
      <div className="w-72 max-w-full rounded-lg bg-surface-overlay p-4 shadow-lg">
        <SpotlightCoachmark onTutorial={() => setTutorial(true)} onDismiss={() => undefined} />
      </div>
      <AuthTutorial open={tutorial} onOpenChange={setTutorial} />
    </Block>
  );
}

function CodesPreview() {
  const [linkCode, setLinkCode] = useState('');
  const [challenge, setChallenge] = useState('');
  return (
    <Block
      title="Коды Minecraft"
      note={`Код привязки ${LINK_CODE_PATTERN} (16 символов) и код подтверждения ${CHALLENGE_PATTERN}. Коды выдаёт только сервер.`}
    >
      <Field
        label="Код привязки Minecraft (16 символов)"
        hint="Вставьте abc123a1b23c4 — дефисы и регистр поправятся сами"
      >
        <LinkCodeInput value={linkCode} onValueChange={setLinkCode} />
      </Field>
      <Field label="Код подтверждения (5 символов)" hint="Буквы и цифры строго на своих местах">
        <OtpInput pattern={CHALLENGE_PATTERN} value={challenge} onChange={setChallenge} />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Неполный код (invalid)</span>
        <LinkCodeInput
          value="ABC-123-A1B2"
          onValueChange={() => undefined}
          invalid
          aria-label="Неполный код привязки"
        />
        <span className="text-xs text-muted-foreground">Недоступно (disabled)</span>
        <LinkCodeInput
          value=""
          onValueChange={() => undefined}
          disabled
          aria-label="Код привязки недоступен"
        />
        <span className="text-xs text-muted-foreground">Проверка и успех</span>
        <OtpInput pattern={CHALLENGE_PATTERN} value="K7QM2" loading aria-label="Идёт проверка" />
        <OtpInput pattern={CHALLENGE_PATTERN} value="K7QM2" success aria-label="Код принят" />
      </div>
    </Block>
  );
}

function ForgotPreviewBlock() {
  const [state, setState] = useState(FORGOT_STATES[0]!.value);
  const current = FORGOT_STATES.find((item) => item.value === state) ?? FORGOT_STATES[0]!;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="max-w-full overflow-x-auto pb-1 scrollbar-thin">
        <SegmentedControl
          size="sm"
          aria-label="Состояние восстановления"
          value={state}
          onValueChange={setState}
          options={FORGOT_STATES.map(({ value, label }) => ({ value, label }))}
        />
      </div>
      <div className="flex justify-center rounded-xl bg-background p-3 md:p-8">
        <AuthPanel>
          <ForgotPasswordForm key={current.value} preview={current.preview} />
        </AuthPanel>
      </div>
    </div>
  );
}

type CarouselDemo = 'autoplay' | 'manual' | 'second' | 'mobile' | 'reduced';

/// Auth Screenshot Carousel — тот же production-компонент, что в панели входа
/// и регистрации, на реальных кадрах из реестра (CDN).
function ShowcasePreview() {
  const [mode, setMode] = useState<CarouselDemo>('autoplay');
  return (
    <Block
      title="Auth Screenshot Carousel"
      note="Правая половина панели входа и регистрации — только реальный скриншот TwoMC на всю площадь (без текста и логотипа): точки, пауза и ← → поверх кадра, «развернуть» справа сверху; автопрокрутка 6 с с паузой на наведении и фокусе, свайп и клавиатура; на телефоне — кадр 16:6 с точками; при «уменьшении движения» — только вручную."
    >
      <div className="max-w-full overflow-x-auto pb-1 scrollbar-thin">
        <SegmentedControl
          size="sm"
          aria-label="Состояние карусели"
          value={mode}
          onValueChange={(value) => setMode(value as CarouselDemo)}
          options={[
            { value: 'autoplay', label: 'Автопрокрутка' },
            { value: 'manual', label: 'Вручную' },
            { value: 'second', label: 'Второй кадр' },
            { value: 'mobile', label: 'Mobile' },
            { value: 'reduced', label: 'Reduced motion' },
          ]}
        />
      </div>
      <div
        className={
          mode === 'mobile'
            ? 'w-[375px] max-w-full overflow-hidden rounded-xl'
            : 'h-[30rem] w-full max-w-[34rem] overflow-hidden rounded-r-2xl'
        }
      >
        <ScreenshotCarousel
          key={mode}
          variant={mode === 'mobile' ? 'compact' : 'fill'}
          autoplay={mode !== 'manual'}
          initialIndex={mode === 'second' ? 1 : 0}
          forceReducedMotion={mode === 'reduced'}
          onOpen={mode === 'mobile' ? undefined : () => undefined}
        />
      </div>
    </Block>
  );
}

export function AuthAdditionsSection() {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 md:grid-cols-2">
        <SpotlightPreview />
        <CodesPreview />
        <Block
          title="Части восстановления"
          note="Маска e-mail строится на сервере; провайдеры — только привязанные и пока недоступны («Скоро»)."
        >
          <MaskedEmail masked={FOUND.maskedEmail!} />
          <RecoveryProviders providers={FOUND.providers} />
          <div className="text-sm text-muted-foreground">
            <BackToLogin />
          </div>
        </Block>
      </div>
      <ShowcasePreview />
      <Block
        title="Забыли пароль?"
        note="Та же форма, что на /forgot-password: по e-mail или по нику, маска адреса, полный e-mail вводит человек."
      >
        <ForgotPreviewBlock />
      </Block>
    </div>
  );
}
