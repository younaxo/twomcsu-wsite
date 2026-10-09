'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/site/config';

/// Логотипы способов оплаты из официальных SVG владельца
/// (`public/assets/payment/*.svg`, оптимизированы SVGO без изменения вида).
/// Белая карточка, фиксированные пропорции, alt. Если ассет ещё не положен
/// в проект — карточка показывает текстовую подпись, а не чужую иконку.
function PaymentLogo({ method }: { method: PaymentMethod }) {
  const [missing, setMissing] = useState(false);
  return (
    <li
      className="flex h-8 w-12 items-center justify-center overflow-hidden rounded-sm border border-border bg-white"
      title={method.label}
    >
      {missing ? (
        <span className="text-[10px] font-semibold text-neutral-700">{method.label}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- статичный SVG-ассет без оптимизации
        <img
          src={method.src}
          alt={method.label}
          width={method.width}
          height={method.height}
          loading="lazy"
          className="h-full w-full object-contain p-1"
          onError={() => setMissing(true)}
        />
      )}
    </li>
  );
}

export function PaymentMethodLogos({ className }: { className?: string }) {
  return (
    <ul aria-label="Способы оплаты" className={cn('flex flex-wrap items-center gap-2', className)}>
      {PAYMENT_METHODS.map((method) => (
        <PaymentLogo key={method.id} method={method} />
      ))}
    </ul>
  );
}
