'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { SERVER_ADDRESS } from '@/lib/site/config';

type ButtonProps = ComponentProps<typeof Button>;

/// Копирование адреса сервера в буфер обмена (hero, быстрый старт, CTA).
/// Без Clipboard API (http/старые браузеры) — честное сообщение с адресом.
export function CopyAddressButton({
  address = SERVER_ADDRESS,
  label = 'Скопировать IP',
  children,
  ...props
}: Omit<ButtonProps, 'onClick' | 'children'> & {
  address?: string;
  label?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success(`Адрес ${address} скопирован`);
    } catch {
      toast.error(`Не удалось скопировать. Адрес сервера: ${address}`);
    }
  };

  return (
    <Button
      type="button"
      aria-label={copied ? `${label}: скопировано` : label}
      data-copied={copied || undefined}
      onClick={copy}
      {...props}
    >
      {copied ? <Check /> : <Copy />}
      {children ?? (copied ? 'Скопировано' : label)}
    </Button>
  );
}
