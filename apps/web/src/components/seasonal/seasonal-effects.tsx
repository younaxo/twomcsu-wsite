'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { devicePowerFactor } from '@/lib/device-power';
import type { SeasonalEffect } from '@/lib/site/seasonal';
import { useSeasonal } from '@/lib/site/use-seasonal';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

/// Движок сезонных эффектов (ADR-0079): один canvas (pointer-events: none,
/// ниже модалок), rAF с паузой в скрытой вкладке, ограниченное число частиц
/// (ширина × плотность, на слабых устройствах и при экономии трафика — меньше),
/// учёт DPR. Несколько эффектов делят один бюджет частиц. Движение — по
/// реальному времени кадра (на 120 Гц не быстрее, чем на 60), скорость и
/// плотность — из админки; на узком экране частиц меньше (ADR-0090).
/// prefers-reduced-motion → эффект не рисуется вовсе.

interface Particle {
  kind: SeasonalEffect;
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  spin: number;
}

const COLORS: Record<SeasonalEffect, string[]> = {
  snow: ['rgba(255,255,255,0.9)', 'rgba(220,235,255,0.8)'],
  hearts: ['rgba(242,90,120,0.75)', 'rgba(255,140,170,0.7)'],
  leaves: ['rgba(242,106,27,0.75)', 'rgba(196,92,40,0.7)', 'rgba(230,170,60,0.7)'],
  rain: ['rgba(150,180,220,0.5)'],
  blossom: ['rgba(255,190,210,0.8)', 'rgba(255,220,230,0.8)'],
  sun: ['rgba(255,214,120,0.35)', 'rgba(255,240,180,0.3)'],
  // День Победы: красные пятиконечные звёзды — вектор на canvas, не emoji;
  // одинаково на всех ОС.
  stars: ['rgba(214,40,40,0.9)', 'rgba(196,30,45,0.85)', 'rgba(232,58,58,0.85)'],
};

/// Звёзды по форме заметнее остальных частиц, поэтому их вдвое меньше.
const KIND_DENSITY: Partial<Record<SeasonalEffect, number>> = { stars: 0.5 };

/// Скорость из админки (1–3) → множитель падения.
export function speedFactor(speed: number): number {
  return speed <= 1 ? 0.6 : speed >= 3 ? 1.6 : 1;
}

/// Частиц на холст: плотность × ширина / 40 × множитель устройства, не больше
/// 120; на узком (мобильном) экране — ещё ×0.6.
export function particleCount(width: number, intensity: number, power = 1): number {
  const density = Math.max(1, Math.min(3, intensity));
  const mobile = width < 640 ? 0.6 : 1;
  return Math.min(120, Math.round(((density * width) / 40) * power * mobile));
}

/// Пятиконечная звезда: внешний радиус r, внутренний — 0.45 r.
function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = turn - Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Перенесено в lib (нужно и профилю: 3D-скин) — реэкспорт для совместимости.
export { devicePowerFactor };

function spawn(kind: SeasonalEffect, width: number, height: number, initial: boolean): Particle {
  return {
    kind,
    x: Math.random() * width,
    y: initial ? Math.random() * height : -20,
    size: 2 + Math.random() * 5,
    speed: 0.4 + Math.random() * 1.2,
    drift: (Math.random() - 0.5) * 0.6,
    phase: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.04,
  };
}

function draw(ctx: CanvasRenderingContext2D, p: Particle, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (p.kind) {
    case 'rain':
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 2, p.y + p.size * 3);
      ctx.stroke();
      return;
    case 'hearts': {
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + s * 0.3);
      ctx.bezierCurveTo(p.x - s, p.y - s * 0.6, p.x - s * 1.4, p.y + s * 0.6, p.x, p.y + s * 1.3);
      ctx.bezierCurveTo(p.x + s * 1.4, p.y + s * 0.6, p.x + s, p.y - s * 0.6, p.x, p.y + s * 0.3);
      ctx.fill();
      return;
    }
    case 'stars':
      // Небольшие: радиус 3–7 px, медленное вращение.
      starPath(ctx, p.x, p.y, 2.5 + p.size * 0.65, p.phase * 0.5);
      ctx.fill();
      return;
    case 'leaves':
    case 'blossom':
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.phase);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.2, p.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    default:
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.kind === 'sun' ? p.size * 2 : p.size / 2, 0, Math.PI * 2);
      ctx.fill();
  }
}

/// Холст эффектов. `contained` — внутри родителя (превью в админке), иначе —
/// на весь экран.
export function EffectsCanvas({
  effects,
  intensity,
  speed = 2,
  contained = false,
  className,
}: {
  effects: SeasonalEffect[];
  intensity: number;
  /// 1–3: скорость падения из админки.
  speed?: number;
  contained?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const key = effects.join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    const kinds = key ? (key.split(',') as SeasonalEffect[]) : [];
    if (!canvas || kinds.length === 0 || reduced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const power = devicePowerFactor(navigator);
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    const resize = () => {
      const dpr = power < 1 ? 1 : Math.min(2, window.devicePixelRatio || 1);
      const box = contained ? canvas.parentElement?.getBoundingClientRect() : null;
      width = Math.round(box?.width ?? window.innerWidth);
      height = Math.round(box?.height ?? window.innerHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density =
        kinds.reduce((sum, kind) => sum + (KIND_DENSITY[kind] ?? 1), 0) / kinds.length;
      const count = Math.max(1, Math.round(particleCount(width, intensity, power) * density));
      particles = Array.from({ length: count }, (_, i) =>
        spawn(kinds[i % kinds.length]!, width, height, true),
      );
    };
    resize();
    let frame = 0;
    let last = 0;
    const factor = speedFactor(speed);
    const tick = (time: number) => {
      // Шаг в «кадрах 60 Гц»: одинаковая скорость на любой частоте экрана;
      // после паузы вкладки — не больше 3 кадров, без рывка.
      const step = last ? Math.min(3, (time - last) / (1000 / 60)) : 1;
      last = time;
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p, index) => {
        const base =
          p.kind === 'rain'
            ? p.speed * 6
            : p.kind === 'sun'
              ? p.speed * 0.15
              : p.kind === 'stars'
                ? p.speed * 0.7
                : p.speed;
        p.y += base * factor * step;
        p.phase += p.spin * step;
        p.x += (p.drift + Math.sin(p.phase) * (p.kind === 'rain' ? 0 : 0.4)) * step;
        if (p.y > height + 20 || p.x < -30 || p.x > width + 30) {
          particles[index] = spawn(p.kind, width, height, false);
        }
        const palette = COLORS[p.kind];
        draw(ctx, p, palette[index % palette.length] ?? palette[0]!);
      });
      frame = window.requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      window.cancelAnimationFrame(frame);
      last = 0;
      if (!document.hidden) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    const observer =
      contained && canvas.parentElement && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(resize)
        : null;
    if (observer && canvas.parentElement) observer.observe(canvas.parentElement);
    else window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [key, intensity, speed, reduced, contained]);

  if (!key || reduced) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="seasonal-effects"
      data-effects={key}
      className={cn(
        'pointer-events-none inset-0',
        contained ? 'absolute' : 'fixed z-effects',
        className,
      )}
    />
  );
}

/// Падающий эффект на сайте: режим, тип, плотность и скорость — из админки
/// (ADR-0090), независимо от остального сезонного оформления.
export function SeasonalEffects() {
  const seasonal = useSeasonal();
  return (
    <EffectsCanvas
      effects={seasonal.effects}
      intensity={seasonal.effectIntensity}
      speed={seasonal.effectSpeed}
    />
  );
}
