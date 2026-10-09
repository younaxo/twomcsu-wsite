'use client';

import type { CreateRoleRequest } from '@twomc/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ColorPicker, HEX_PATTERN } from '@/components/ui/color-picker';
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
import { NumberStepper } from '@/components/ui/stepper';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useCreateRole } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

export function slugify(value: string): string {
  const map: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'c',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };
  return value
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}

/// Создание роли (`roles.create`). Приоритет не может превышать максимальный
/// приоритет текущего администратора (иерархия; backend проверяет сам).
export function RoleFormDialog({ open, onOpenChange, onCreated }: RoleFormDialogProps) {
  const { effective, isSuperuser } = usePermissions();
  const create = useCreateRole();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [priority, setPriority] = useState(10);
  const [color, setColor] = useState('#f26a1b');
  const [isAssignable, setIsAssignable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched]);

  const maxPriority = isSuperuser ? Infinity : (effective?.maxPriority ?? 0);
  const priorityTooHigh = priority >= maxPriority;
  const valid =
    name.trim().length >= 2 &&
    /^[a-z0-9-]+$/.test(slug) &&
    displayName.trim().length >= 2 &&
    HEX_PATTERN.test(color) &&
    !priorityTooHigh;

  const submit = async () => {
    setError(null);
    const body: CreateRoleRequest = {
      name: name.trim(),
      slug,
      displayName: displayName.trim(),
      priority,
      color,
      isAssignable,
    };
    try {
      const role = await create.mutateAsync(body);
      toast.success(`Роль «${role.displayName}» создана`);
      onOpenChange(false);
      onCreated?.(role.id);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая роль</DialogTitle>
          <DialogDescription>
            Роль — контейнер прав. Права выдаются на вкладке Permissions после создания.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field label="Название" required hint="Внутреннее, уникальное">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field
            label="Slug"
            required
            hint="Латиница, цифры, дефис; совпадает с именем PNG-префикса"
          >
            <Input
              value={slug}
              className="font-mono"
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              invalid={slug !== '' && !/^[a-z0-9-]+$/.test(slug)}
            />
          </Field>
          <Field label="Отображаемое имя" required>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Приоритет"
              required
              hint={
                isSuperuser
                  ? 'Выше — старше'
                  : `Должен быть ниже вашего (${effective?.maxPriority ?? 0})`
              }
              error={priorityTooHigh ? 'Выше вашего приоритета' : null}
            >
              <NumberStepper value={priority} onValueChange={setPriority} min={1} max={10_000} />
            </Field>
            <Field label="Цвет" required>
              <ColorPicker value={color} onChange={(next) => setColor(next ?? '')} />
            </Field>
          </div>
          <SwitchField
            label="Можно назначать пользователям"
            description="Выключите для технических ролей"
            checked={isAssignable}
            onCheckedChange={setIsAssignable}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={!valid} loading={create.isPending}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
