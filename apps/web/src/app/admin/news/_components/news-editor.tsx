'use client';

import type { NewsCategory } from '@twomc/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CATEGORY_LABEL } from '@/app/(site)/_components/news-section';
import { DateTimeField } from '@/components/admin/date-time-field';
import { PageSection } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  EDITABLE_STATUSES,
  NEWS_STATUS_LABEL,
  useAdminNewsActions,
  type AdminNewsArticle,
  type NewsInput,
  type NewsStatus,
} from '@/lib/admin/news';
import { getErrorMessage } from '@/lib/api/errors';

/// Редактор новости (срез 7.4, ADR-0143): текст в Markdown с предпросмотром
/// тем же рендером, что на сайте; обложка — ссылка на CDN проекта (API
/// другие хосты не принимает). Slug задаётся только при создании.

const SLUG = /^[a-z0-9-]+$/;
const SITE_IMAGE = /^(https:\/\/cdn-files\.twomc\.su\/\S+|\/(?!\/)\S*)$/;

function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

export function NewsEditor({ article }: { article: AdminNewsArticle | null }) {
  const router = useRouter();
  const { create, update } = useAdminNewsActions();
  const [form, setForm] = useState(() => ({
    title: article?.title ?? '',
    slug: article?.slug ?? '',
    excerpt: article?.excerpt ?? '',
    content: article?.content ?? '',
    category: article?.category ?? ('ANNOUNCEMENT' as NewsCategory),
    status: article?.status ?? ('DRAFT' as NewsStatus),
    scheduledFor: article?.scheduledFor ?? null,
    coverImage: article?.coverImage ?? '',
    metaTitle: article?.metaTitle ?? '',
    metaDescription: article?.metaDescription ?? '',
    allowComments: article?.allowComments ?? true,
    tags: article?.tags.map((entry) => entry.tag).join(', ') ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Введите заголовок';
    if (!article && !SLUG.test(form.slug)) {
      next.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
    if (!form.content.trim()) next.content = 'Напишите текст новости';
    if (
      form.status === 'SCHEDULED' &&
      (!form.scheduledFor || new Date(form.scheduledFor).getTime() <= Date.now())
    ) {
      next.scheduledFor = 'Укажите дату и время публикации в будущем';
    }
    if (form.coverImage.trim() && !SITE_IMAGE.test(form.coverImage.trim())) {
      next.coverImage = 'Ссылка на cdn-files.twomc.su или путь сайта (/…)';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const cover = form.coverImage.trim();
    const body: NewsInput = {
      title: form.title.trim(),
      content: form.content,
      category: form.category,
      status: form.status,
      allowComments: form.allowComments,
      tags: parseTags(form.tags),
      ...(form.status === 'SCHEDULED' && form.scheduledFor
        ? { scheduledFor: form.scheduledFor }
        : {}),
      // Пустая строка очищает поле при правке (API принимает длину 0).
      excerpt: form.excerpt.trim(),
      metaTitle: form.metaTitle.trim(),
      metaDescription: form.metaDescription.trim(),
      // При правке пустая обложка убирается (null), при создании — не передаётся.
      ...(cover ? { coverImage: cover } : article ? { coverImage: null } : {}),
    };
    const onError = (error: unknown) => toast.error(getErrorMessage(error));
    if (article) {
      update.mutate(
        { id: article.id, body },
        { onSuccess: () => toast.success('Новость сохранена'), onError },
      );
    } else {
      create.mutate(
        { ...body, slug: form.slug },
        {
          onSuccess: (created) => {
            toast.success('Новость создана');
            router.replace(`/admin/news/${encodeURIComponent(created.id)}`);
          },
          onError,
        },
      );
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PageSection title="Новость">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Заголовок" required error={errors.title} className="sm:col-span-2">
            <Input
              value={form.title}
              maxLength={200}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
          {article ? null : (
            <Field
              label="Slug"
              required
              error={errors.slug}
              hint="Адрес: /news/slug, потом не меняется"
            >
              <Input
                value={form.slug}
                maxLength={160}
                spellCheck={false}
                onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
              />
            </Field>
          )}
          <Field label="Категория">
            <select
              className={inputClassName}
              value={form.category}
              onChange={(e) => set({ category: e.target.value as NewsCategory })}
            >
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Статус">
            <select
              className={inputClassName}
              value={form.status}
              onChange={(e) => set({ status: e.target.value as NewsStatus })}
            >
              {EDITABLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {NEWS_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </Field>
          {form.status === 'SCHEDULED' ? (
            <Field
              label="Публикация"
              required
              error={errors.scheduledFor}
              hint="Новость выйдет сама в это время (проверка раз в минуту)"
              className="sm:col-span-2"
            >
              <DateTimeField
                label="Публикация"
                value={form.scheduledFor}
                fallbackTime="12:00"
                onChange={(value) => set({ scheduledFor: value })}
              />
            </Field>
          ) : null}
          <Field label="Анонс" hint="Короткий текст для списка новостей" className="sm:col-span-2">
            <Textarea
              value={form.excerpt}
              maxLength={500}
              rows={2}
              onChange={(e) => set({ excerpt: e.target.value })}
            />
          </Field>
        </div>
      </PageSection>

      <PageSection title="Текст">
        <Tabs defaultValue="write" variant="line">
          <TabsList aria-label="Текст новости">
            <TabsTrigger value="write">Текст</TabsTrigger>
            <TabsTrigger value="preview">Предпросмотр</TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="pt-3">
            <Field label="Текст (Markdown)" required error={errors.content}>
              <Textarea
                value={form.content}
                maxLength={100_000}
                rows={16}
                onChange={(e) => set({ content: e.target.value })}
              />
            </Field>
          </TabsContent>
          <TabsContent value="preview" className="pt-3">
            {form.content.trim() ? (
              <div data-testid="news-preview">
                <SafeMarkdown source={form.content} className="text-base leading-relaxed" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Текста пока нет.</p>
            )}
          </TabsContent>
        </Tabs>
      </PageSection>

      <PageSection title="Оформление и SEO">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Обложка"
            error={errors.coverImage}
            hint="Ссылка на cdn-files.twomc.su или путь сайта"
            className="sm:col-span-2"
          >
            <Input
              value={form.coverImage}
              maxLength={500}
              spellCheck={false}
              onChange={(e) => set({ coverImage: e.target.value })}
            />
          </Field>
          <Field label="Теги" hint="Через запятую, до 20" className="sm:col-span-2">
            <Input value={form.tags} onChange={(e) => set({ tags: e.target.value })} />
          </Field>
          <Field label="SEO-заголовок">
            <Input
              value={form.metaTitle}
              maxLength={200}
              onChange={(e) => set({ metaTitle: e.target.value })}
            />
          </Field>
          <Field label="SEO-описание">
            <Input
              value={form.metaDescription}
              maxLength={500}
              onChange={(e) => set({ metaDescription: e.target.value })}
            />
          </Field>
          <CheckboxField
            label="Разрешить комментарии"
            checked={form.allowComments}
            onCheckedChange={(checked) => set({ allowComments: checked === true })}
          />
        </div>
      </PageSection>

      <div className="flex gap-2">
        <Button type="submit" loading={create.isPending || update.isPending}>
          {article ? 'Сохранить' : 'Создать'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/news')}>
          К списку
        </Button>
      </div>
    </form>
  );
}
