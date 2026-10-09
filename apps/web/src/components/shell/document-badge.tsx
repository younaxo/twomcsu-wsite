'use client';

import { useDocumentBadge } from '@/lib/site/document-badge';

/// Монтируется один раз в AppShell: заголовок вкладки `twomc.su` /
/// `(N) twomc.su` и favicon с красным бейджем по общему unread-счётчику.
export function DocumentBadge() {
  useDocumentBadge();
  return null;
}
