import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Design lab',
  description: 'Внутренняя лаборатория дизайн-направлений twomc.su',
  robots: { index: false, follow: false },
};

/// Внутренний маршрут: noindex; оформление — глобальные токены «Полдня».
export default function DesignLabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
