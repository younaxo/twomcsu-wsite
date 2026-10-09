import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-form';

export const metadata: Metadata = {
  title: { absolute: 'twomc.su' },
  robots: { index: false, follow: false },
};

/// /forgot-password — запрос письма для сброса пароля (`POST /auth/forgot-password`,
/// Turnstile). Ответ нейтральный: существование аккаунта не раскрывается.
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
