'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PageSection } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  LEGAL_TOPIC_SLUGS,
  TOPIC_CATEGORY_LABEL,
  TOPIC_VISIBILITY_LABEL,
  useAdminTopicActions,
  type AdminTopic,
  type TopicCategory,
  type TopicInput,
  type TopicVisibility,
} from '@/lib/admin/topics';
import { getErrorMessage } from '@/lib/api/errors';

/// Редактор темы (срез 7.4, ADR-0145): текст в Markdown с предпросмотром тем
/// же рендером, что на сайте. Для юридических документов — подсказка, какой
/// slug подхватит страница /legal/…

const SLUG = /^[a-z0-9-]+$/;

export function TopicEditor({ topic }: { topic: AdminTopic | null }) {
  const router = useRouter();
  const { create, update } = useAdminTopicActions();
  const [form, setForm] = useState(() => ({
    title: topic?.title ?? '',
    slug: topic?.slug ?? '',
    category: topic?.category ?? ('RULES' as TopicCategory),
    visibility: topic?.visibility ?? ('PUBLIC' as TopicVisibility),
    description: topic?.description ?? '',
    content: topic?.content ?? '',
    isActive: topic?.isActive ?? true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Введите заголовок';
    if (!topic && !SLUG.test(form.slug)) {
      next.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
    if (!form.content.trim()) next.content = 'Напишите текст';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const body: TopicInput = {
      title: form.title.trim(),
      category: form.category,
      visibility: form.visibility,
      description: form.description.trim(),
      content: form.content,
    };
    const onError = (error: unknown) => toast.error(getErrorMessage(error));
    if (topic) {
      update.mutate(
        { id: topic.id, body: { ...body, isActive: form.isActive } },
        { onSuccess: () => toast.success('Тема сохранена'), onError },
      );
    } else {
      create.mutate(
        { ...body, slug: form.slug },
        {
          onSuccess: (created) => {
            toast.success('Тема создана');
            router.replace(`/admin/topics/${encodeURIComponent(created.id)}`);
          },
          onError,
        },
      );
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PageSection title="Тема">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Заголовок" required error={errors.title} className="sm:col-span-2">
            <Input
              value={form.title}
              maxLength={200}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
          {topic ? null : (
            <Field
              label="Slug"
              required
              error={errors.slug}
              hint={
                form.category === 'DOCUMENTS'
                  ? `Юридический документ на сайте: ${LEGAL_TOPIC_SLUGS.join(', ')}`
                  : 'Потом не меняется'
              }
            >
              <Input
                value={form.slug}
                maxLength={160}
                spellCheck={false}
                onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
              />
            </Field>
          )}
          <Field label="Раздел">
            <select
              className={inputClassName}
              value={form.category}
              onChange={(e) => set({ category: e.target.value as TopicCategory })}
            >
              {Object.entries(TOPIC_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Кому видна">
            <select
              className={inputClassName}
              value={form.visibility}
              onChange={(e) => set({ visibility: e.target.value as TopicVisibility })}
            >
              {Object.entries(TOPIC_VISIBILITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Описание" hint="Коротко — для списка" className="sm:col-span-2">
            <Textarea
              value={form.description}
              maxLength={500}
              rows={2}
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>
          {topic ? (
            <CheckboxField
              label="Опубликована"
              checked={form.isActive}
              onCheckedChange={(checked) => set({ isActive: checked === true })}
            />
          ) : null}
        </div>
      </PageSection>

      <PageSection title="Текст">
        <Tabs defaultValue="write" variant="line">
          <TabsList aria-label="Текст темы">
            <TabsTrigger value="write">Текст</TabsTrigger>
            <TabsTrigger value="preview">Предпросмотр</TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="pt-3">
            <Field label="Текст (Markdown)" required error={errors.content}>
              <Textarea
                value={form.content}
                maxLength={100_000}
                rows={18}
                onChange={(e) => set({ content: e.target.value })}
              />
            </Field>
          </TabsContent>
          <TabsContent value="preview" className="pt-3">
            {form.content.trim() ? (
              <div data-testid="topic-preview">
                <SafeMarkdown source={form.content} className="text-sm leading-relaxed" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Текста пока нет.</p>
            )}
          </TabsContent>
        </Tabs>
      </PageSection>

      <div className="flex gap-2">
        <Button type="submit" loading={create.isPending || update.isPending}>
          {topic ? 'Сохранить' : 'Создать'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/topics')}>
          К списку
        </Button>
      </div>
    </form>
  );
}
