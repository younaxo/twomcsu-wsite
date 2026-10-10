'use client';

import { ArrowLeft, ArrowRight, Check, Copy, ImageOff, Play } from 'lucide-react';
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
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import {
  RUTUBE_ICON_SRC,
  TUTORIAL_STEPS,
  TUTORIAL_VIDEOS,
  type TutorialStep,
  type TutorialVideoPlatform,
} from '@/lib/auth/tutorial';

/// Обучающий tutorial регистрации (ADR-0072, переработка — ADR-0087) —
/// production Dialog поверх auth-панели. Только объясняет процесс: сам ничего
/// не выполняет и не связан с состоянием регистрации на backend.

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

/// Слот скриншота: реальный файл из конфига или явно помеченный временный
/// слот (не имитация Minecraft). Пропорции фиксированы — картинку не зажимает.
export function TutorialScreenshot({
  step,
  index,
  className,
}: {
  step: TutorialStep;
  index?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-surface-sunken',
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
          sizes="(min-width: 1024px) 600px, 100vw"
          quality={90}
          className="object-contain"
        />
      ) : (
        <div
          role="img"
          aria-label={`${step.image.alt} — скриншот будет добавлен`}
          className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center"
        >
          {index !== undefined ? (
            <span
              aria-hidden
              className="font-display text-5xl font-bold tabular-nums text-border-strong"
            >
              {index + 1}
            </span>
          ) : (
            <ImageOff aria-hidden className="size-6 text-subtle-foreground" />
          )}
          <p className="max-w-xs text-sm text-muted-foreground">{step.image.alt}</p>
          <span className="rounded-full bg-background-subtle px-2.5 py-0.5 text-xs font-medium text-subtle-foreground">
            Скриншот появится позже
          </span>
        </div>
      )}
    </div>
  );
}

const VIDEO_LABEL: Record<TutorialVideoPlatform, string> = {
  youtube: 'YouTube',
  rutube: 'RuTube',
};

function VideoIcon({ platform }: { platform: TutorialVideoPlatform }) {
  if (platform === 'youtube') return <BrandIcon id="youtube" className="text-[#FF0000]" />;
  return RUTUBE_ICON_SRC ? (
    // eslint-disable-next-line @next/next/no-img-element -- локальный SVG-логотип
    <img src={RUTUBE_ICON_SRC} alt="" aria-hidden className="size-4 shrink-0" />
  ) : (
    <Play aria-hidden />
  );
}

/// «Видеоинструкция»: обе кнопки видны всегда. С URL из конфига — внешняя
/// ссылка (переход подтверждает общий ExternalLinkGuard); без URL — кнопка
/// недоступна с подсказкой «Видео готовится», никогда не ведёт на `#`.
export function TutorialVideos({
  videos = TUTORIAL_VIDEOS,
  className,
}: {
  videos?: Record<TutorialVideoPlatform, string | null>;
  className?: string;
}) {
  const platforms: TutorialVideoPlatform[] = ['youtube', 'rutube'];
  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="tutorial-videos">
      <p className="text-xs font-semibold uppercase tracking-wider text-subtle-foreground">
        Видеоинструкция
      </p>
      <div className="flex flex-wrap gap-2">
        {platforms.map((platform) => {
          const href = videos[platform];
          if (href) {
            return (
              <Button key={platform} asChild variant="secondary" size="sm">
                <a href={href} rel="noopener noreferrer" data-video={platform}>
                  <VideoIcon platform={platform} />
                  {VIDEO_LABEL[platform]}
                </a>
              </Button>
            );
          }
          return (
            <Tooltip key={platform} content="Видео готовится">
              <Button
                variant="secondary"
                size="sm"
                aria-disabled
                data-video={platform}
                onClick={(event) => event.preventDefault()}
              >
                <VideoIcon platform={platform} />
                {VIDEO_LABEL[platform]}
              </Button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

/// Навигация по шагам: каждый сегмент — кнопка перехода на свой шаг
/// (все шаги можно смотреть свободно). Состояния: пройден, текущий, впереди;
/// hover и focus-visible — у каждого сегмента.
export function TutorialNav({
  steps,
  index,
  onSelect,
}: {
  steps: TutorialStep[];
  index: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Шаги обучения" data-testid="tutorial-nav">
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((item, i) => {
          const state = i < index ? 'completed' : i === index ? 'active' : 'upcoming';
          return (
            <li key={item.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={state === 'active' ? 'step' : undefined}
                aria-label={`Шаг ${i + 1}: ${item.title}`}
                data-state={state}
                className={cn(
                  'group flex w-full flex-col gap-2 rounded-md px-0.5 pb-1 pt-1.5 text-left outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-overlay',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-1.5 w-full rounded-full transition-colors duration',
                    state === 'active' && 'bg-primary',
                    state === 'completed' && 'bg-primary/45 group-hover:bg-primary/70',
                    state === 'upcoming' && 'bg-surface-sunken group-hover:bg-border-strong',
                  )}
                />
                <span
                  aria-hidden
                  className={cn(
                    'hidden truncate text-xs transition-colors duration sm:block',
                    state === 'active'
                      ? 'font-semibold text-foreground'
                      : 'text-subtle-foreground group-hover:text-foreground',
                  )}
                >
                  {state === 'completed' ? (
                    <Check className="mr-1 inline size-3 align-[-1px] text-primary" />
                  ) : (
                    <span className="mr-1 tabular-nums">{i + 1}</span>
                  )}
                  {item.short}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/// Один шаг: инструкция — номер, заголовок, пояснение, действия.
function TutorialInstruction({
  step,
  index,
  total,
  standalone,
}: {
  step: TutorialStep;
  index: number;
  total: number;
  standalone: boolean;
}) {
  const Title = standalone ? 'h3' : DialogTitle;
  const Description = standalone ? 'p' : DialogDescription;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        Шаг {index + 1} из {total}
      </p>
      <Title className="font-display text-xl font-bold leading-tight tracking-tight md:text-2xl">
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
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {step.example.label}:
          <span className="rounded bg-surface-sunken px-2 py-0.5 font-mono font-semibold tracking-widest text-foreground">
            {step.example.value}
          </span>
          <span className="text-xs text-subtle-foreground">X — буква, 0 — цифра</span>
        </p>
      ) : null}
    </div>
  );
}

/// Шаг целиком: скриншот + инструкция (desktop — рядом, mobile — друг под
/// другом) и блок видео. Вне Dialog (design-lab) — `standalone`.
export function TutorialStepView({
  step,
  index,
  total,
  videos = TUTORIAL_VIDEOS,
  standalone = false,
}: {
  step: TutorialStep;
  index: number;
  total: number;
  videos?: Record<TutorialVideoPlatform, string | null>;
  standalone?: boolean;
}) {
  return (
    <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
      <TutorialScreenshot step={step} index={index} className="max-h-[34dvh] lg:max-h-none" />
      <div className="flex min-w-0 flex-col gap-5">
        <TutorialInstruction step={step} index={index} total={total} standalone={standalone} />
        <TutorialVideos videos={videos} className="mt-auto" />
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
  const select = (next: number) => setIndex(Math.min(steps.length - 1, Math.max(0, next)));

  // Стрелки листают шаги, если фокус не в поле ввода.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      select(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      select(index - 1);
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
      <DialogContent
        size="xl"
        onKeyDown={onKeyDown}
        data-testid="auth-tutorial"
        className="max-w-[72rem]"
      >
        <header className="flex shrink-0 flex-col gap-4 px-5 pb-2 pt-5 md:px-8 md:pt-6">
          <div className="flex flex-col gap-0.5 pr-10">
            <p className="font-display text-base font-semibold">Как зарегистрироваться</p>
            <p className="text-sm text-muted-foreground">
              6 шагов: аккаунт на сайте и подтверждение Minecraft-ника
            </p>
          </div>
          <TutorialNav steps={steps} index={index} onSelect={select} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-3 scrollbar-thin md:px-8">
          <TutorialStepView step={step} index={index} total={steps.length} videos={videos} />
        </div>
        <DialogFooter className="flex-row items-center justify-between pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-between md:px-8">
          <Button variant="ghost" onClick={() => select(index - 1)} disabled={index === 0}>
            <ArrowLeft />
            Назад
          </Button>
          <span className="text-sm tabular-nums text-subtle-foreground" aria-hidden>
            {index + 1} / {steps.length}
          </span>
          {last ? (
            <Button onClick={() => onOpenChange(false)}>Понятно</Button>
          ) : (
            <Button onClick={() => select(index + 1)}>
              Далее
              <ArrowRight />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
