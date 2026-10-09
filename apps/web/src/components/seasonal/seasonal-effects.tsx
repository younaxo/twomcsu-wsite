'use client';

import { useEffect, useRef } from 'react';
import type { SeasonalEffect } from '@/lib/site/seasonal';
import { useSeasonal } from '@/lib/site/use-seasonal';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

/// Движок сезонных эффектов (ADR-0079): один canvas поверх страницы
/// (pointer-events: none, ниже модалок), rAF с паузой в скрытой вкладке,
/// ограниченное число частиц (по ширине экрана и плотности), учёт DPR.
/// prefers-reduced-motion → эффект не рисуется вовсе.

interface Particle {
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

/// Частиц на экран: плотность × ширина / 40, не больше 120.
export function particleCount(width: number, intensity: number): number {
  return Math.min(120, Math.round((Math.max(1, Math.min(3, intensity)) * width) / 40));
}

function spawn(width: number, height: number, initial: boolean): Particle {
  return {
    x: Math.random() * width,
    y: initial ? Math.random() * height : -20,
    size: 2 + Math.random() * 5,
    speed: 0.4 + Math.random() * 1.2,
    drift: (Math.random() - 0.5) * 0.6,
    phase: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.04,
  };
}

function draw(ctx: CanvasRenderingContext2D, effect: SeasonalEffect, p: Particle, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (effect) {
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
      ctx.arc(p.x, p.y, effect === 'sun' ? p.size * 2 : p.size / 2, 0, Math.PI * 2);
      ctx.fill();
  }
}

export function SeasonalEffects() {
  const seasonal = useSeasonal();
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const effect = seasonal.showEffects ? seasonal.campaign?.effect : undefined;
  const intensity = seasonal.effectIntensity;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !effect || reduced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = particleCount(width, intensity);
      particles = Array.from({ length: count }, () => spawn(width, height, true));
    };
    resize();
    const palette = COLORS[effect];
    let frame = 0;
    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p, index) => {
        const fall = effect === 'rain' ? p.speed * 6 : effect === 'sun' ? p.speed * 0.15 : p.speed;
        p.y += fall;
        p.phase += p.spin;
        p.x += p.drift + Math.sin(p.phase) * (effect === 'rain' ? 0 : 0.4);
        if (p.y > height + 20 || p.x < -30 || p.x > width + 30) {
          particles[index] = spawn(width, height, false);
        }
        draw(ctx, effect, p, palette[index % palette.length] ?? palette[0]!);
      });
      frame = window.requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      window.cancelAnimationFrame(frame);
      if (!document.hidden) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [effect, intensity, reduced]);

  if (!effect || reduced) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="seasonal-effects"
      data-effect={effect}
      className="pointer-events-none fixed inset-0 z-effects"
    />
  );
}
