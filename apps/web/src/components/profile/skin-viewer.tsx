'use client';

import { Box, Pause, Play, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SkinViewer as SkinViewerInstance } from 'skinview3d';
import { Button, IconButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { devicePowerFactor } from '@/lib/device-power';
import { skinTextureUrl, useSkinMeta, type SkinMetaDto } from '@/lib/profile/hooks';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

/// 3D-скин Minecraft в профиле (ADR-0089). three.js + skinview3d грузятся
/// динамически и только когда блок виден на экране — остальной сайт их не
/// получает. Вращение мышью и пальцем, zoom в пределах, idle-анимация (не при
/// reduced-motion). Нет WebGL — плоский вид текстуры; слабое устройство или
/// экономия трафика — 3D по кнопке.

const ROTATE_STEP = Math.PI / 6;

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl bg-surface-sunken',
        className,
      )}
    >
      {children}
    </div>
  );
}

/// Плоская текстура скина — когда 3D недоступно (без WebGL).
function FlatSkin({ src, username }: { src: string; username: string }) {
  return (
    <Frame>
      {/* eslint-disable-next-line @next/next/no-img-element -- текстура со своего API */}
      <img
        src={src}
        alt={`Текстура скина ${username}`}
        width={128}
        height={128}
        className="size-32 object-contain [image-rendering:pixelated]"
      />
      <p className="absolute inset-x-3 bottom-3 text-center text-xs text-muted-foreground">
        3D недоступно на этом устройстве
      </p>
    </Frame>
  );
}

function SkinCanvas({
  username,
  meta,
}: {
  username: string;
  meta: SkinMetaDto & { version: string };
}) {
  const reduced = usePrefersReducedMotion();
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<SkinViewerInstance | null>(null);
  const [webgl] = useState(() => (typeof document === 'undefined' ? true : hasWebGL()));
  const [manual] = useState(() =>
    typeof navigator === 'undefined' ? false : devicePowerFactor(navigator) < 1,
  );
  const [requested, setRequested] = useState(false);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [playing, setPlaying] = useState(!reduced);
  const skinUrl = skinTextureUrl(username, 'skin', meta.version);
  const capeUrl = meta.cape ? skinTextureUrl(username, 'cape', meta.version) : null;
  const start = webgl && visible && (!manual || requested);

  // Инициализация — только когда блок попал в экран.
  useEffect(() => {
    const node = holder.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!start || !canvas.current || !holder.current) return;
    let disposed = false;
    let resize: ResizeObserver | null = null;
    setState('loading');
    void import('skinview3d')
      .then(async (skinview3d) => {
        if (disposed || !canvas.current || !holder.current) return;
        const { width, height } = holder.current.getBoundingClientRect();
        const instance = new skinview3d.SkinViewer({
          canvas: canvas.current,
          width: Math.max(1, Math.round(width)),
          height: Math.max(1, Math.round(height)),
          pixelRatio: 'match-device',
          zoom: 0.85,
          fov: 50,
        });
        viewer.current = instance;
        instance.controls.enablePan = false;
        instance.controls.enableZoom = true;
        instance.controls.minDistance = 25;
        instance.controls.maxDistance = 70;
        instance.autoRotate = false;
        if (!reduced) instance.animation = new skinview3d.IdleAnimation();
        await instance.loadSkin(skinUrl, { model: meta.model === 'slim' ? 'slim' : 'default' });
        if (capeUrl) await instance.loadCape(capeUrl);
        if (disposed) return;
        resize = new ResizeObserver(([entry]) => {
          if (!entry) return;
          instance.setSize(
            Math.max(1, Math.round(entry.contentRect.width)),
            Math.max(1, Math.round(entry.contentRect.height)),
          );
        });
        resize.observe(holder.current);
        setState('ready');
      })
      .catch(() => {
        if (!disposed) setState('error');
      });
    return () => {
      disposed = true;
      resize?.disconnect();
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [start, skinUrl, capeUrl, meta.model, reduced]);

  useEffect(() => {
    const instance = viewer.current;
    if (!instance?.animation) return;
    instance.animation.paused = !playing;
  }, [playing, state]);

  if (!webgl) return <FlatSkin src={skinUrl} username={username} />;

  const rotate = (delta: number) => {
    const instance = viewer.current;
    if (instance) instance.playerObject.rotation.y += delta;
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={holder}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-surface-sunken"
      >
        <canvas
          ref={canvas}
          aria-label={`3D-модель скина ${username}: перетащите, чтобы повернуть; колесо или щипок — приблизить`}
          role="img"
          className={cn(
            'size-full touch-none cursor-grab active:cursor-grabbing',
            state !== 'ready' && 'invisible',
          )}
          data-testid="skin-canvas"
        />
        {state === 'loading' || (state === 'idle' && start) ? (
          <Skeleton className="absolute inset-0 rounded-xl" />
        ) : null}
        {manual && !requested ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <Box aria-hidden className="size-8 text-subtle-foreground" />
            <p className="text-sm text-muted-foreground">3D-просмотр выключен для экономии</p>
            <Button size="sm" variant="secondary" onClick={() => setRequested(true)}>
              Показать 3D-скин
            </Button>
          </div>
        ) : null}
        {state === 'error' ? (
          <p
            className="absolute inset-x-3 bottom-3 text-center text-sm text-muted-foreground"
            role="status"
          >
            Не удалось показать 3D-скин.
          </p>
        ) : null}
      </div>
      {state === 'ready' ? (
        <div
          className="flex items-center justify-center gap-1"
          role="toolbar"
          aria-label="Управление 3D-скином"
        >
          <Tooltip content="Повернуть влево">
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Повернуть влево"
              onClick={() => rotate(-ROTATE_STEP)}
            >
              <RotateCcw />
            </IconButton>
          </Tooltip>
          <Tooltip content="Повернуть вправо">
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Повернуть вправо"
              onClick={() => rotate(ROTATE_STEP)}
            >
              <RotateCw />
            </IconButton>
          </Tooltip>
          {!reduced ? (
            <Tooltip content={playing ? 'Остановить анимацию' : 'Включить анимацию'}>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={playing ? 'Остановить анимацию' : 'Включить анимацию'}
                aria-pressed={playing}
                onClick={() => setPlaying((value) => !value)}
              >
                {playing ? <Pause /> : <Play />}
              </IconButton>
            </Tooltip>
          ) : null}
          <Tooltip content="Сбросить вид">
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Сбросить вид"
              onClick={() => {
                const instance = viewer.current;
                if (!instance) return;
                instance.playerObject.rotation.y = 0;
                instance.resetCameraPose();
              }}
            >
              <Undo2 />
            </IconButton>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}

/// Блок «Скин» в профиле: загрузка → 3D / честное пустое состояние.
export function SkinViewer({ username, className }: { username: string; className?: string }) {
  const meta = useSkinMeta(username);
  return (
    <section
      className={cn('flex flex-col gap-3', className)}
      aria-label="Скин Minecraft"
      data-testid="skin-viewer"
    >
      <h2 className="text-sm font-semibold">Скин Minecraft</h2>
      {meta.isPending ? (
        <Skeleton className="aspect-[3/4] w-full rounded-xl" />
      ) : meta.isError ? (
        <Frame>
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <p className="text-sm text-muted-foreground">Не удалось загрузить скин.</p>
            <Button size="sm" variant="secondary" onClick={() => void meta.refetch()}>
              Повторить
            </Button>
          </div>
        </Frame>
      ) : meta.data.available && meta.data.version ? (
        <SkinCanvas username={username} meta={{ ...meta.data, version: meta.data.version }} />
      ) : (
        <Frame>
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <Box aria-hidden className="size-8 text-subtle-foreground" />
            <p className="text-sm text-muted-foreground">Для этого ника нет скина в Minecraft.</p>
            <p className="text-xs text-subtle-foreground">
              Скин появится, когда у ника есть лицензионный профиль Minecraft.
            </p>
          </div>
        </Frame>
      )}
    </section>
  );
}
