import { notFound } from 'next/navigation';
import { DesignLab } from './design-lab';
import { isDirectionId, type DirectionId } from './directions';

/// /design-lab — НЕ production-страница. В production доступна только при
/// NEXT_PUBLIC_DESIGN_LAB=1 (для staging-показа), иначе 404.
export default function DesignLabPage({
  searchParams,
}: {
  searchParams: { d?: string; theme?: string };
}) {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DESIGN_LAB !== '1') {
    notFound();
  }
  const direction: DirectionId = isDirectionId(searchParams.d) ? searchParams.d : 'ember';
  const theme = searchParams.theme === 'dark' ? 'dark' : 'light';
  return <DesignLab initialDirection={direction} initialTheme={theme} />;
}
