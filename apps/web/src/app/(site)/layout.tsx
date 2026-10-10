import { MustChangePasswordRedirect } from '@/components/auth/must-change-password';
import { AppShell } from '@/components/shell/app-shell';

/// Публичные страницы сайта — единая оболочка (rail, header, footer,
/// плавающие действия). /admin, /login и /design-lab живут вне неё.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <MustChangePasswordRedirect />
      {children}
    </AppShell>
  );
}
