import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { LEGAL_OWNER, SUPPORT } from '@/lib/site/config';

/// Юридические документы. Тексты владелец ещё не передал — страница честно
/// сообщает, что документ готовится (никаких выдуманных юридических текстов).
/// «Юридическая информация» — реальные данные владельца из конфига.
const DOCS: Record<string, { title: string; summary: string }> = {
  terms: {
    title: 'Пользовательское соглашение',
    summary: 'Условия использования сайта, магазина и серверов twomc.su.',
  },
  privacy: {
    title: 'Политика конфиденциальности',
    summary: 'Какие данные собирает twomc.su и как они защищаются.',
  },
  'personal-data': {
    title: 'Согласие на обработку персональных данных',
    summary: 'Какие персональные данные обрабатываются, в каких целях и на какой срок.',
  },
  cookies: {
    title: 'Политика Cookie',
    summary: 'Какие cookie использует сайт и как управлять согласием.',
  },
  refunds: {
    title: 'Политика возвратов',
    summary: 'Условия возврата средств за покупки в магазине twomc.su.',
  },
  info: {
    title: 'Юридическая информация',
    summary: 'Сведения о владельце проекта twomc.su.',
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export function generateMetadata({ params }: { params: { doc: string } }): Metadata {
  return { title: { absolute: 'twomc.su' }, description: DOCS[params.doc]?.summary };
}

export default function LegalDocPage({ params }: { params: { doc: string } }) {
  const doc = DOCS[params.doc];
  if (!doc) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <PageHeader title={doc.title} description={doc.summary} />
      {params.doc === 'info' ? (
        <section className="flex flex-col gap-2 rounded-xl bg-surface p-6 text-sm shadow-sm">
          <p>
            <span className="text-muted-foreground">Владелец: </span>
            {LEGAL_OWNER.name}
          </p>
          <p>
            <span className="text-muted-foreground">ИНН: </span>
            <span className="font-mono">{LEGAL_OWNER.inn}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Статус: </span>
            {LEGAL_OWNER.status}
          </p>
          <p>
            <span className="text-muted-foreground">Связь: </span>
            <a href={`mailto:${SUPPORT.adminEmail}`} className="text-primary hover:underline">
              {SUPPORT.adminEmail}
            </a>
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-xl bg-surface p-6 text-sm shadow-sm">
          <p className="font-medium">Документ готовится к публикации.</p>
          <p className="text-muted-foreground">
            Полный текст появится на этой странице. По вопросам до публикации пишите на{' '}
            <a href={`mailto:${SUPPORT.email}`} className="text-primary hover:underline">
              {SUPPORT.email}
            </a>
            .
          </p>
          <Link href="/legal/info" className="text-primary hover:underline">
            Юридическая информация о владельце
          </Link>
        </section>
      )}
    </div>
  );
}
