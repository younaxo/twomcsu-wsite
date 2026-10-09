'use client';

import type { BookmarkDto, SavedFilterDto, ScheduledExportDto } from '@twomc/shared';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader, PageSection } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SwitchField } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  useBookmarkMutations,
  useBookmarks,
  useSavedFilterMutations,
  useSavedFilters,
  useScheduledExportMutations,
  useScheduledExports,
} from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';

const PAGES = [
  { value: 'users', label: 'Пользователи' },
  { value: 'orders', label: 'Заказы' },
  { value: 'audit-log', label: 'Журнал аудита' },
  { value: 'reports', label: 'Обращения' },
  { value: 'news', label: 'Новости' },
];

/* ---------------- Закладки ---------------- */

function BookmarksTab() {
  const { can } = usePermissions();
  const bookmarks = useBookmarks();
  const { create, remove, reorder } = useBookmarkMutations();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [deleting, setDeleting] = useState<BookmarkDto | null>(null);

  const move = async (list: BookmarkDto[], index: number, delta: number) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    try {
      await reorder.mutateAsync(next.map((b) => b.id));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <PageSection
      description="Быстрые ссылки в админке — только ваши."
      actions={
        can('bookmarks.create') ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus />
            Добавить
          </Button>
        ) : null
      }
    >
      <Card flush>
        <QueryBoundary query={bookmarks}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState size="sm" title="Закладок нет" />
            ) : (
              <Table>
                <TableBody>
                  {list.map((b, index) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link
                          href={b.url}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {b.title}
                        </Link>
                        <p className="font-mono text-xs text-subtle-foreground">{b.url}</p>
                      </TableCell>
                      <TableCell className="w-32 text-right">
                        {can('bookmarks.reorder') ? (
                          <>
                            <IconButton
                              aria-label="Выше"
                              size="sm"
                              disabled={index === 0}
                              onClick={() => move(list, index, -1)}
                            >
                              <ArrowUp />
                            </IconButton>
                            <IconButton
                              aria-label="Ниже"
                              size="sm"
                              disabled={index === list.length - 1}
                              onClick={() => move(list, index, 1)}
                            >
                              <ArrowDown />
                            </IconButton>
                          </>
                        ) : null}
                        {can('bookmarks.delete') ? (
                          <IconButton
                            aria-label={`Удалить ${b.title}`}
                            size="sm"
                            onClick={() => setDeleting(b)}
                          >
                            <Trash2 />
                          </IconButton>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
        </QueryBoundary>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая закладка</DialogTitle>
            <DialogDescription>
              Путь внутри админки (/admin/users) или внешний URL.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Название" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </Field>
            <Field label="Адрес" required>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="font-mono"
                placeholder="/admin/users"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!title.trim() || !url.trim()}
              loading={create.isPending}
              onClick={async () => {
                try {
                  await create.mutateAsync({ title: title.trim(), url: url.trim() });
                  toast.success('Закладка добавлена');
                  setTitle('');
                  setUrl('');
                  setOpen(false);
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => (o ? null : setDeleting(null))}
        title={`Удалить закладку «${deleting?.title ?? ''}»?`}
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            setDeleting(null);
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </PageSection>
  );
}

/* ---------------- Сохранённые фильтры ---------------- */

function SavedFiltersTab() {
  const { can } = usePermissions();
  const filters = useSavedFilters();
  const { create, update, remove } = useSavedFilterMutations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [page, setPage] = useState('users');
  const [json, setJson] = useState('{}');
  const [deleting, setDeleting] = useState<SavedFilterDto | null>(null);
  const jsonValid = (() => {
    try {
      return typeof JSON.parse(json) === 'object';
    } catch {
      return false;
    }
  })();

  return (
    <PageSection
      description="Наборы фильтров для списков. Применение из таблиц — следующая итерация."
      actions={
        can('saved_filters.create') ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus />
            Создать
          </Button>
        ) : null
      }
    >
      <Card flush>
        <QueryBoundary query={filters}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState size="sm" title="Фильтров нет" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Страница</TableHead>
                    <TableHead>Фильтры</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        {f.name} {f.isDefault ? <Badge tone="primary">по умолчанию</Badge> : null}
                      </TableCell>
                      <TableCell>
                        {PAGES.find((p) => p.value === f.page)?.label ?? f.page}
                      </TableCell>
                      <TableCell className="max-w-72 truncate font-mono text-xs text-muted-foreground">
                        {JSON.stringify(f.filters)}
                      </TableCell>
                      <TableCell className="text-right">
                        {can('saved_filters.edit') && !f.isDefault ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={update.isPending}
                            onClick={() => update.mutate({ id: f.id, isDefault: true })}
                          >
                            Сделать основным
                          </Button>
                        ) : null}
                        {can('saved_filters.delete') ? (
                          <IconButton
                            aria-label={`Удалить ${f.name}`}
                            size="sm"
                            onClick={() => setDeleting(f)}
                          >
                            <Trash2 />
                          </IconButton>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
        </QueryBoundary>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый фильтр</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Название" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Страница">
              <Select value={page} onValueChange={setPage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Фильтры (JSON)" error={jsonValid ? null : 'Невалидный JSON'}>
              <Textarea
                rows={4}
                value={json}
                className="font-mono text-xs"
                onChange={(e) => setJson(e.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!name.trim() || !jsonValid}
              loading={create.isPending}
              onClick={async () => {
                try {
                  await create.mutateAsync({
                    name: name.trim(),
                    page,
                    filters: JSON.parse(json) as Record<string, unknown>,
                  });
                  toast.success('Фильтр сохранён');
                  setName('');
                  setJson('{}');
                  setOpen(false);
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => (o ? null : setDeleting(null))}
        title={`Удалить фильтр «${deleting?.name ?? ''}»?`}
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            setDeleting(null);
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </PageSection>
  );
}

/* ---------------- Запланированные экспорты ---------------- */

function ScheduledExportsTab() {
  const { can } = usePermissions();
  const exportsQuery = useScheduledExports();
  const { create, update, remove } = useScheduledExportMutations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [page, setPage] = useState('users');
  const [schedule, setSchedule] = useState('0 6 * * 1');
  const [email, setEmail] = useState('');
  const [deleting, setDeleting] = useState<ScheduledExportDto | null>(null);

  return (
    <PageSection
      description="Расписание в формате cron. Фактическое выполнение появится в PHASE 29 (ADR-0048) — пока только настройка."
      actions={
        can('exports.scheduled.create') ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus />
            Запланировать
          </Button>
        ) : null
      }
    >
      <Card flush>
        <QueryBoundary query={exportsQuery}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState size="sm" title="Запланированных экспортов нет" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Страница</TableHead>
                    <TableHead>Расписание</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Последний запуск</TableHead>
                    <TableHead>Активен</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>
                        {PAGES.find((p) => p.value === e.page)?.label ?? e.page}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.schedule}</TableCell>
                      <TableCell>{e.email ?? '—'}</TableCell>
                      <TableCell>{e.lastRunAt ? formatDateTime(e.lastRunAt) : '—'}</TableCell>
                      <TableCell>
                        <SwitchField
                          label=""
                          aria-label={`Активен: ${e.name}`}
                          checked={e.isActive}
                          disabled={!can('exports.scheduled.edit') || update.isPending}
                          onCheckedChange={(v) => update.mutate({ id: e.id, isActive: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {can('exports.scheduled.delete') ? (
                          <IconButton
                            aria-label={`Удалить ${e.name}`}
                            size="sm"
                            onClick={() => setDeleting(e)}
                          >
                            <Trash2 />
                          </IconButton>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
        </QueryBoundary>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Запланированный экспорт</DialogTitle>
            <DialogDescription>
              CSV будет формироваться по расписанию и отправляться на e-mail.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Название" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Страница">
              <Select value={page} onValueChange={setPage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Расписание (cron)"
              required
              hint="мин час день месяц день_недели; «0 6 * * 1» — по понедельникам в 06:00"
            >
              <Input
                value={schedule}
                className="font-mono"
                onChange={(e) => setSchedule(e.target.value)}
              />
            </Field>
            <Field label="E-mail" hint="Куда отправлять файл">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!name.trim() || schedule.trim().split(/\s+/).length !== 5}
              loading={create.isPending}
              onClick={async () => {
                try {
                  await create.mutateAsync({
                    name: name.trim(),
                    page,
                    format: 'csv',
                    schedule: schedule.trim(),
                    email: email.trim() || undefined,
                    isActive: true,
                  });
                  toast.success('Экспорт запланирован');
                  setName('');
                  setOpen(false);
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => (o ? null : setDeleting(null))}
        title={`Удалить «${deleting?.name ?? ''}»?`}
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            setDeleting(null);
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </PageSection>
  );
}

export default function ToolsPage() {
  const { can } = usePermissions();
  const tabs = [
    can('bookmarks.view') && { value: 'bookmarks', label: 'Закладки' },
    can('saved_filters.view') && { value: 'filters', label: 'Сохранённые фильтры' },
    can('exports.scheduled.view') && { value: 'exports', label: 'Запланированные экспорты' },
  ].filter((t): t is { value: string; label: string } => Boolean(t));

  return (
    <PermissionGate
      requirement={['bookmarks.view', 'saved_filters.view', 'exports.scheduled.view']}
    >
      <PageHeader
        title="Личные инструменты"
        breadcrumbs={[{ label: 'Личные инструменты' }]}
        description="Закладки, фильтры и расписания — персональные для каждого администратора."
      />
      <Tabs defaultValue={tabs[0]?.value} variant="line">
        <TabsList aria-label="Инструменты">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="bookmarks">
          <BookmarksTab />
        </TabsContent>
        <TabsContent value="filters">
          <SavedFiltersTab />
        </TabsContent>
        <TabsContent value="exports">
          <ScheduledExportsTab />
        </TabsContent>
      </Tabs>
    </PermissionGate>
  );
}
