import { notFound } from 'next/navigation';
import { DesignLab } from './design-lab';

/// /design-lab — НЕ production-страница. В production доступна только при
/// NEXT_PUBLIC_DESIGN_LAB=1 (для staging-показа), иначе 404.
export default function DesignLabPage() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DESIGN_LAB !== '1') {
    notFound();
  }
  return <DesignLab />;
}
