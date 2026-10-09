'use client';

import { Check, Copy, ImageOff, Play } from 'lucide-react';
import Image from 'next/image';
import { useState, type KeyboardEvent } from 'react';
import { BrandIcon } from '@/components/shell/brand-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  TUTORIAL_STEPS,
  TUTORIAL_VIDEOS,
  type TutorialStep,
  type TutorialVideoPlatform,
} from '@/lib/auth/tutorial';

/// Обучающий tutorial регистрации (ADR-0072) — production Dialog поверх
/// auth-панели. Только объясняет процесс: сам ничего не выполняет и не
/// связан с состоянием регистрации на backend.

function CopyCommand({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Не удалось скопировать — выделите команду вручную.');
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-sunken py-1.5 pl-3 pr-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{value}</code>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void copy()}
        aria-label="Скопировать команду"
      >
        {copied ? <Check className="text-success" /> : <Copy />}
        {copied ? 'Скопировано' : 'Копировать'}
      </Button>
    </div>
  );
}

/// Слот скриншота: реальный файл из конфига или явно помеченный временный макет.
export function TutorialScreenshot({
  step,
  className,
}: {
  step: TutorialStep;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-surface-sunken',
        'aspect-[16/10] w-full',
        className,
      )}
      data-testid="tutorial-screenshot"
      data-step={step.id}
    >
      {step.image.src ? (
        <Image
          src={step.image.src}
          alt={step.image.alt}
          fill
          sizes="(min-width: 768px) 480px, 100vw"
          quality={90}
          className="object-contain"
        />
      ) : (
        <div
          role="img"
          aria-label={`${step.image.alt} — скриншот будет добавлен`}
          className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center"
        >
          <ImageOff aria-hidden className="size-6 text-subtle-foreground" />
          <p className="text-sm text-muted-foreground">{step.image.alt}</p>
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
            Временный макет — скриншот будет добавлен
          </span>
        </div>
      )}
    </div>
  );
}

const VIDEO_LABEL: Record<TutorialVideoPlatform, string> = {
  youtube: 'Смотреть на YouTube',
  rutube: 'Смотреть на RuTube',
};

/// Видео-инструкции из конфига; без URL кнопки нет. Внешний переход
/// подтверждает общий ExternalLinkGuard.
export function TutorialVideos({
  videos = TUTORIAL_VIDEOS,
}: {
  videos?: Record<TutorialVideoPlatform, string | null>;
}) {
  const items = (Object.keys(videos) as TutorialVideoPlatform[]).filter((key) => videos[key]);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="tutorial-videos">
      {items.map((platform) => (
        <Button key={platform} asChild variant="secondary" size="sm">
          <a href={videos[platform] ?? undefined} rel="noopener noreferrer">
            {platform === 'youtube' ? (
              <BrandIcon id="youtube" className="text-[#FF0000]" />
            ) : (
              <Play aria-hidden />
            )}
            {VIDEO_LABEL[platform]}
          </a>
        </Button>
      ))}
    </div>
  );
}

/// Один этап: скриншот + номер, заголовок, пояснение, действия.
export function TutorialStepView({
  step,
  index,
  total,
  standalone = false,
}: {
  step: TutorialStep;
  index: number;
  total: number;
  /// Вне Dialog (превью в design-lab): заголовок — обычный элемент.
  standalone?: boolean;
}) {
  const Title = standalone ? 'h3' : DialogTitle;
  const Description = standalone ? 'p' : DialogDescription;
  return (
    <div className="grid min-h-0 gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-6">
      <TutorialScreenshot step={step} className="max-h-[32dvh] md:max-h-none" />
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Этап {index + 1} из {total}
        </p>
        <Title className="font-display text-xl font-bold leading-tight tracking-tight">
          {step.title}
        </Title>
        <Description className="text-sm text-muted-foreground">{step.description}</Description>
        {step.points ? (
          <ol className="flex flex-col gap-1.5 text-sm">
            {step.points.map((point, i) => (
              <li key={point} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-muted-foreground"
                >
                  {step.id === 'done' ? <Check className="size-3 text-success" /> : i + 1}
                </span>
                {point}
              </li>
            ))}
          </ol>
        ) : null}
        {step.command ? <CopyCommand value={step.command} /> : null}
        {step.example ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {step.example.label}:
            <span className="rounded bg-surface-sunken px-2 py-0.5 font-mono font-semibold tracking-widest text-foreground">
              {step.example.value}
            </span>
            {step.id === 'confirm-in-game' ? (
              <span className="text-xs text-subtle-foreground">(пример)</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AuthTutorial({
  open,
  onOpenChange,
  steps = TUTORIAL_STEPS,
  videos = TUTORIAL_VIDEOS,
  initialStep = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps?: TutorialStep[];
  videos?: Record<TutorialVideoPlatform, string | null>;
  initialStep?: number;
}) {
  const [index, setIndex] = useState(initialStep);
  const step = steps[index] ?? steps[0]!;
  const last = index === steps.length - 1;
  const go = (delta: number) =>
    setIndex((value) => Math.min(steps.length - 1, Math.max(0, value + delta)));

  // Стрелки листают этапы, если фокус не в поле ввода.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setIndex(initialStep);
      }}
    >
      <DialogContent size="xl" onKeyDown={onKeyDown} data-testid="auth-tutorial">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-12 scrollbar-thin md:px-7 md:pt-7">
          <div
            role="progressbar"
            aria-label="Прогресс обучения"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={index + 1}
            aria-valuetext={`Этап ${index + 1} из ${steps.length}`}
            className="flex gap-1.5 pr-10"
          >
            {steps.map((item, i) => (
              <span
                key={item.id}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors duration',
                  i <= index ? 'bg-primary' : 'bg-surface-sunken',
                )}
              />
            ))}
          </div>
          <TutorialStepView step={step} index={index} total={steps.length} />
          <TutorialVideos videos={videos} />
        </div>
        <DialogFooter className="flex-row items-center justify-between pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-between">
          <Button variant="ghost" onClick={() => go(-1)} disabled={index === 0}>
            Назад
          </Button>
          <span className="text-sm tabular-nums text-subtle-foreground" aria-hidden>
            {index + 1} / {steps.length}
          </span>
          {last ? (
            <Button onClick={() => onOpenChange(false)}>Понятно</Button>
          ) : (
            <Button onClick={() => go(1)}>Далее</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
