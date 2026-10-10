import { useId } from 'react';
import { cn } from '@/lib/cn';

/// Флаги языков — SVG (ADR-0085), а не emoji: регионально-индикаторные
/// символы на Windows и части Linux выводятся буквами («GB» вместо флага).
/// Пропорции 3:2, скругление и тонкий контур — белая полоса не теряется на
/// светлом фоне. Декоративные: подпись языка всегда рядом текстом.
export type FlagCode = 'ru' | 'gb';

function Russia() {
  return (
    <>
      <rect width="9" height="2" fill="#FFFFFF" />
      <rect y="2" width="9" height="2" fill="#0039A6" />
      <rect y="4" width="9" height="2" fill="#D52B1E" />
    </>
  );
}

/// Union Jack — стандартная геометрия флага (60×30), обрезанная до 3:2.
function UnitedKingdom() {
  const id = useId().replace(/:/g, '');
  return (
    <g transform="scale(0.15 0.2)">
      <clipPath id={`gb-s-${id}`}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id={`gb-t-${id}`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#gb-s-${id})`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath={`url(#gb-t-${id})`}
          stroke="#C8102E"
          strokeWidth="4"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </g>
  );
}

const FLAGS: Record<FlagCode, () => JSX.Element> = {
  ru: Russia,
  gb: UnitedKingdom,
};

export function FlagIcon({ code, className }: { code: FlagCode; className?: string }) {
  const Flag = FLAGS[code];
  return (
    <svg
      viewBox="0 0 9 6"
      aria-hidden
      focusable="false"
      data-flag={code}
      className={cn(
        'inline-block h-[0.75em] w-[1.125em] shrink-0 overflow-hidden rounded-[2px] shadow-[0_0_0_1px_rgb(var(--border-subtle))]',
        className,
      )}
      preserveAspectRatio="none"
    >
      <Flag />
    </svg>
  );
}
