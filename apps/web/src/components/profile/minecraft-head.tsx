'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { skinTextureUrl, useSkinMeta } from '@/lib/profile/hooks';

/// 3D-голова Minecraft рядом с аватаром (B5): CSS-куб из той же текстуры
/// скина, что и полный 3D-просмотр (ADR-0089) — без WebGL и без three.js.
/// Шесть граней + второй слой (шапка). При наведении — плавный поворот (не при
/// reduced-motion). Нет скина — ничего не рисуется (аватар остаётся).

/// Координаты граней головы в развёртке скина 64×64 (x, y — в пикселях).
const FACES = {
  front: [8, 8],
  back: [24, 8],
  right: [0, 8],
  left: [16, 8],
  top: [8, 0],
  bottom: [16, 0],
} as const;
const HAT_OFFSET = 32;

type Face = keyof typeof FACES;

const TRANSFORM: Record<Face, (half: number) => string> = {
  front: (h) => `translateZ(${h}px)`,
  back: (h) => `rotateY(180deg) translateZ(${h}px)`,
  right: (h) => `rotateY(-90deg) translateZ(${h}px)`,
  left: (h) => `rotateY(90deg) translateZ(${h}px)`,
  top: (h) => `rotateX(90deg) translateZ(${h}px)`,
  bottom: (h) => `rotateX(-90deg) translateZ(${h}px)`,
};

function faceStyle(src: string, face: Face, size: number, hat: boolean): CSSProperties {
  const scale = size / 8;
  const [x, y] = FACES[face];
  return {
    width: size,
    height: size,
    backgroundImage: `url("${src}")`,
    backgroundSize: `${64 * scale}px ${64 * scale}px`,
    backgroundPosition: `-${(x + (hat ? HAT_OFFSET : 0)) * scale}px -${y * scale}px`,
    imageRendering: 'pixelated',
    transform: TRANSFORM[face](size / 2),
  };
}

export function MinecraftHead({
  username,
  size = 40,
  className,
}: {
  username: string;
  size?: number;
  className?: string;
}) {
  const meta = useSkinMeta(username);
  if (!meta.data?.available || !meta.data.version) return null;
  const src = skinTextureUrl(username, 'skin', meta.data.version);
  // Шапка — чуть больше головы, как в игре.
  const hat = Math.round(size * 1.125);
  return (
    <span
      role="img"
      aria-label={`Голова скина ${username}`}
      data-testid="minecraft-head"
      className={cn('group/head inline-block shrink-0 [perspective:400px]', className)}
      style={{ width: hat, height: hat }}
    >
      <span className="relative block size-full transition-transform duration-slow ease-out [transform-style:preserve-3d] [transform:rotateX(-22deg)_rotateY(-35deg)] group-hover/head:[transform:rotateX(-18deg)_rotateY(35deg)] motion-reduce:transition-none motion-reduce:group-hover/head:[transform:rotateX(-22deg)_rotateY(-35deg)]">
        {(Object.keys(FACES) as Face[]).map((face) => (
          <span
            key={face}
            aria-hidden
            className="absolute [backface-visibility:hidden]"
            style={{
              ...faceStyle(src, face, size, false),
              left: (hat - size) / 2,
              top: (hat - size) / 2,
            }}
          />
        ))}
        {(Object.keys(FACES) as Face[]).map((face) => (
          <span
            key={`hat-${face}`}
            aria-hidden
            className="absolute [backface-visibility:hidden]"
            style={faceStyle(src, face, hat, true)}
          />
        ))}
      </span>
    </span>
  );
}
