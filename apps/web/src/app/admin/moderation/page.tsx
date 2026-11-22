import { redirect } from 'next/navigation';

/// Раздел «Модерация»: корень ведёт в очередь жалоб на комментарии.
export default function ModerationIndex() {
  redirect('/admin/moderation/comments');
}
