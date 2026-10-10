'use client';

import { Mail, Megaphone, Power, Sparkles, Wrench } from 'lucide-react';
import Link from 'next/link';
import { Can } from '@/components/admin/permission-gate';
import { Button } from '@/components/ui/button';

/// Быстрые действия дашборда (ТЗ §63): только те, на которые есть право.
export function QuickActions() {
  return (
    <>
      <Can requirement="announcements.manage">
        <Button asChild variant="secondary" className="justify-start">
          <Link href="/admin/announcements?new=1">
            <Megaphone />
            Создать объявление
          </Link>
        </Button>
      </Can>
      <Can requirement="communications.messages.send">
        <Button asChild variant="secondary" className="justify-start">
          <Link href="/admin/communications">
            <Mail />
            Отправить системное сообщение
          </Link>
        </Button>
      </Can>
      <Can requirement="system.maintenance.manage">
        <Button asChild variant="secondary" className="justify-start">
          <Link href="/admin/system?tab=maintenance">
            <Wrench />
            Включить техработы
          </Link>
        </Button>
      </Can>
      <Can requirement="settings.seasonal.view">
        <Button asChild variant="secondary" className="justify-start">
          <Link href="/admin/appearance">
            <Sparkles />
            Управление оформлением
          </Link>
        </Button>
      </Can>
      <Can requirement="system.modules.view">
        <Button asChild variant="secondary" className="justify-start">
          <Link href="/admin/system?tab=modules">
            <Power />
            Управление модулями
          </Link>
        </Button>
      </Can>
    </>
  );
}
