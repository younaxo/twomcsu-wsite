import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: { absolute: 'twomc.su' },
  robots: { index: false, follow: false },
};

/// /register — регистрация по реальному контракту `POST /auth/register`
/// (e-mail, ник, пароль, Turnstile). Реферального кода в контракте нет —
/// поле не выдумываем.
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
