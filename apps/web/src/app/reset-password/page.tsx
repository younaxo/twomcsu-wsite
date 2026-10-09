import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = {
  title: { absolute: 'twomc.su' },
  robots: { index: false, follow: false },
};

/// /reset-password?token=… — новый пароль по токену из письма
/// (`POST /auth/reset-password`, Turnstile). Suspense — для useSearchParams.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
