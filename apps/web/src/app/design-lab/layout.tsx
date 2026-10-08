import type { Metadata } from 'next';
import { labFontVariables } from './fonts';

export const metadata: Metadata = {
  title: 'Design lab',
  description: 'Внутренняя лаборатория дизайн-направлений twomc.su',
  robots: { index: false, follow: false },
};

/// Внутренний маршрут: шрифты трёх кандидатов подключаются только здесь.
export default function DesignLabLayout({ children }: { children: React.ReactNode }) {
  return <div className={labFontVariables}>{children}</div>;
}
