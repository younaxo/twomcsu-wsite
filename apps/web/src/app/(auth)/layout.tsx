import type { ReactNode } from 'react';
import { AuthLayout } from '@/components/auth/auth-layout';

/// Общая auth-панель для /login, /register, /forgot-password, /reset-password
/// и /auth/result (ADR-0071).
export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
