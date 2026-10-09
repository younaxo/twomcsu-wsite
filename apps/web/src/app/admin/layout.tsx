import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { RequireAuth } from '@/components/admin/require-auth';

export const metadata: Metadata = {
  // Title вкладки ведёт DocumentBadge (`twomc.su | A [N]`); metadata задаёт
  // тот же бренд, чтобы до гидрации не мелькали названия разделов.
  title: { absolute: 'twomc.su', template: 'twomc.su' },
  robots: { index: false, follow: false },
};

/// /admin/* — защищённая зона: сессия + хотя бы одно admin-permission.
/// Каркас (сайдбар, топбар, палитра) общий для всех экранов PHASE 21.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}
