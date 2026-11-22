'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { emptyDraft } from '@/lib/admin/form-builder';
import { FormBuilder } from '../_components/form-builder';

/// Новая форма (право `forms.create`): создаётся черновиком, публикация — в списке.
export default function NewFormPage() {
  const [initial] = useState(emptyDraft);
  return (
    <PermissionGate requirement="forms.create">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Новая форма"
          breadcrumbs={[
            { label: 'Контент' },
            { label: 'Формы', href: '/admin/forms' },
            { label: 'Новая форма' },
          ]}
          description="Поля, порядок и предпросмотр. Форма создаётся черновиком."
        />
        <FormBuilder mode="create" initial={initial} />
      </div>
    </PermissionGate>
  );
}
