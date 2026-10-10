'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/lib/auth/store';

/// Выход из аккаунта — одна политика для всех мест (mini profile, sheet,
/// админка, экран «нет доступа»): только после подтверждения в нашем диалоге
/// (Escape, ловушка фокуса и возврат фокуса — у AlertDialog), без
/// `window.confirm`. После выхода — обновить страницу или перейти по адресу.
export function LogoutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Выйти из аккаунта?"
      description="Вы действительно хотите выйти из twomc.su?"
      confirmLabel="Выйти"
      destructive
      onConfirm={onConfirm}
    />
  );
}

export function useLogoutConfirm(after: 'refresh' | `/${string}` = 'refresh') {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const [open, setOpen] = useState(false);

  const dialog = (
    <LogoutConfirmDialog
      open={open}
      onOpenChange={setOpen}
      onConfirm={async () => {
        await logout();
        if (after === 'refresh') router.refresh();
        else router.replace(after);
      }}
    />
  );

  return { request: () => setOpen(true), dialog };
}
