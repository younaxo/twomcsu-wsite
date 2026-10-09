'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import type { SeasonalEffect } from '@/lib/site/seasonal';
import { useSeasonal } from '@/lib/site/use-seasonal';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

/// Движок сезонных эффектов (ADR-0079): один canvas (pointer-events: none,
/// ниже модалок), rAF с паузой в скрытой вкладке, ограниченное число частиц
/// (ширина × плотность, на слабых устройствах и при экономии трафика — меньше),
/// учёт DPR. Несколько эффектов делят один бюджет частиц.
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
};

/// Частиц на холст: плотность × ширина / 40 × множитель устройства, не больше 120.
export function particleCount(width: number, intensity: number, power = 1): number {
  const density = Math.max(1, Math.min(3, intensity));
  return Math.min(120, Math.round(((density * width) / 40) * power));
}

/// Множитель для слабых устройств: экономия трафика — 0.4, ≤ 4 ядер или
/// ≤ 4 ГБ памяти — 0.5, иначе 1.
export function devicePowerFactor(
  nav: Pick<Navigator, 'hardwareConcurrency'> & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  },
): number {
  if (nav.connection?.saveData) return 0.4;
  const weak = (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  return weak ? 0.5 : 1;
}

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
  contained = false,
  className,
}: {
  effects: SeasonalEffect[];
  intensity: number;
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
      const count = particleCount(width, intensity, power);
      particles = Array.from({ length: count }, (_, i) =>
        spawn(kinds[i % kinds.length]!, width, height, true),
      );
    };
    resize();
    let frame = 0;
    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p, index) => {
        const fall = p.kind === 'rain' ? p.speed * 6 : p.kind === 'sun' ? p.speed * 0.15 : p.speed;
        p.y += fall;
        p.phase += p.spin;
        p.x += p.drift + Math.sin(p.phase) * (p.kind === 'rain' ? 0 : 0.4);
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
  }, [key, intensity, reduced, contained]);

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

/// Эффекты активной кампании на сайте (флаг «Эффекты» и плотность — из админки).
export function SeasonalEffects() {
  const seasonal = useSeasonal();
  return <EffectsCanvas effects={seasonal.effects} intensity={seasonal.effectIntensity} />;
}
