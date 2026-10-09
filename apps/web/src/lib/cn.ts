import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/// Склейка Tailwind-классов с разрешением конфликтов (последний побеждает).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
