'use client';

import { useEffect, useState } from 'react';

/// Текущий devicePixelRatio (зум браузера и масштаб Windows 125/150% его
/// меняют) — для чёткого pixel-art. На сервере и до гидрации — 1.
export function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let media: MediaQueryList | null = null;
    const update = () => {
      setRatio(window.devicePixelRatio || 1);
      media?.removeEventListener('change', update);
      // Запрос «resolution» срабатывает только при смене именно этого значения.
      media = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) ?? null;
      media?.addEventListener('change', update);
    };
    update();
    return () => media?.removeEventListener('change', update);
  }, []);
  return ratio;
}

/// Масштаб pixel-art около `target`, при котором один пиксель исходника — целое
/// число физических пикселей экрана (без «рваных» пикселей). DPR 2 → ×1.5
/// (3 px), DPR 1.5 → ×1.33 (2 px), DPR 1.25 → ×1.6 (2 px). Если ближайший целый
/// вариант заметно крупнее цели (DPR 1: ×2), остаётся `target` — с
/// `image-rendering: pixelated` он не мылит, а префикс не становится большим.
export function crispScale(target: number, dpr: number): number {
  const ratio = dpr > 0 ? dpr : 1;
  const devicePixels = Math.max(1, Math.round(target * ratio));
  const scale = devicePixels / ratio;
  return scale > target * 1.17 ? target : scale;
}
