'use client';

import { BookOpen } from 'lucide-react';
import { useState } from 'react';
import { BackToLogin, RecoveryProviders } from '@/app/(auth)/forgot-password/forgot-form';
import { SpotlightCoachmark } from '@/components/auth/auth-layout';
import { LinkCodeInput } from '@/components/auth/link-code-input';
import { ProfileEngagement } from '@/components/profile/profile-engagement';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { OtpInput } from '@/components/ui/otp-input';
import { CHALLENGE_PATTERN, LINK_CODE_PATTERN } from '@/lib/auth/minecraft-code';

/// Auth-дополнения (ADR-0092) и активность профиля (ADR-0091) — production-
/// компоненты: spotlight регистрации, поля кодов Minecraft, восстановление
/// по нику (маска, провайдеры), «← Вернуться ко входу», просмотры и реакции.

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

export function AuthAdditionsSection() {
  const [linkCode, setLinkCode] = useState('');
  const [challenge, setChallenge] = useState('');
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Block
        title="Registration Spotlight"
        note="При входе в регистрацию: затемнение, кнопка над ним и подсказка рядом."
      >
        <div className="relative flex flex-col items-end gap-2 overflow-hidden rounded-xl bg-black/45 p-4">
          <Button
            size="sm"
            variant="ghost"
            className="bg-surface-raised shadow-lg ring-2 ring-primary hover:bg-surface-raised"
          >
            <BookOpen />
            Как зарегистрироваться
          </Button>
          <div className="w-72 max-w-full rounded-lg bg-surface-overlay p-4 text-foreground shadow-lg">
            <SpotlightCoachmark onTutorial={() => undefined} onDismiss={() => undefined} />
          </div>
        </div>
      </Block>

      <Block
        title="Коды Minecraft"
        note={`Код привязки ${LINK_CODE_PATTERN} (16 символов) и код подтверждения ${CHALLENGE_PATTERN}.`}
      >
        <Field
          label="Код привязки Minecraft (16 символов)"
          hint="Вставьте abc123a1b23c4 — дефисы встанут сами"
        >
          <LinkCodeInput value={linkCode} onValueChange={setLinkCode} />
        </Field>
        <Field label="Код подтверждения (5 символов)">
          <OtpInput pattern={CHALLENGE_PATTERN} value={challenge} onChange={setChallenge} />
        </Field>
        <LinkCodeInput
          value="ABC-123-A1B2"
          onValueChange={() => undefined}
          invalid
          aria-label="Неверный код"
        />
      </Block>

      <Block
        title="Восстановление по нику"
        note="Маска e-mail строится на сервере; провайдеры — только привязанные, пока недоступны."
      >
        <div className="flex flex-col gap-1 rounded-lg bg-surface-sunken px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Почта аккаунта</span>
          <span className="font-mono text-sm">y***o@i*****.com</span>
        </div>
        <RecoveryProviders providers={['discord', 'telegram']} />
        <div className="text-sm text-muted-foreground">
          <BackToLogin />
        </div>
      </Block>

      <Block
        title="Активность профиля"
        note="Просмотры без своих и дублей; лайк/дизлайк — одна оценка, свой профиль — нельзя."
      >
        <ProfileEngagement
          handle="design-lab"
          stats={{ views: 128, likes: 24, dislikes: 2, myReaction: 'LIKE' }}
          own={false}
          signedIn={false}
        />
      </Block>
    </div>
  );
}
