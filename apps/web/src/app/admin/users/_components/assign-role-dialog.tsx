'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useAssignRole, useRoles } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

export interface AssignRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  /// Уже выданные роли — исключаются из списка.
  assignedRoleIds: string[];
}

/// Выдача роли пользователю (`roles.assign`). Список — только назначаемые
/// роли не выше приоритета текущего администратора (иерархию всё равно
/// проверяет backend).
export function AssignRoleDialog({
  open,
  onOpenChange,
  userId,
  username,
  assignedRoleIds,
}: AssignRoleDialogProps) {
  const { effective, isSuperuser } = usePermissions();
  const roles = useRoles(open);
  const assign = useAssignRole(userId);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const maxPriority = effective?.maxPriority ?? 0;
  const options = (roles.data ?? [])
    .filter((role) => role.isAssignable && !assignedRoleIds.includes(role.id))
    .map((role) => ({
      value: role.id,
      label: role.displayName,
      description: `приоритет ${role.priority}${!isSuperuser && role.priority >= maxPriority ? ' · выше вашего' : ''}`,
      disabled: !isSuperuser && role.priority >= maxPriority,
      keywords: [role.slug, role.name],
    }));

  const submit = async () => {
    if (!roleId) {
      return;
    }
    try {
      await assign.mutateAsync({ roleId, reason: reason.trim() || undefined });
      toast.success(`Роль выдана: ${username}`);
      setRoleId(null);
      setReason('');
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Выдать роль</DialogTitle>
          <DialogDescription>
            Пользователь {username} получит права роли сразу. Запись попадёт в историю роли.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field label="Роль" required>
            <Combobox
              options={options}
              value={roleId}
              onValueChange={setRoleId}
              placeholder="Выберите роль"
              searchPlaceholder="Название или slug"
              loading={roles.isPending}
              emptyText="Нет доступных ролей"
            />
          </Field>
          <Field label="Причина" hint="Необязательно, видна в истории роли">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit} loading={assign.isPending} disabled={!roleId}>
            Выдать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
