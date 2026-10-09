import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: { absolute: 'twomc.su' },
  robots: { index: false, follow: false },
};

/// /login — вход по e-mail/нику и паролю. `?next=` — внутренний путь,
/// куда вернуть после входа (по умолчанию /admin). Suspense нужен для
/// useSearchParams при статическом рендере.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
