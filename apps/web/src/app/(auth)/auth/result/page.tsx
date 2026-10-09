import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SocialResultView } from './result-view';

export const metadata: Metadata = {
  title: { absolute: 'twomc.su' },
  robots: { index: false, follow: false },
};

export default function SocialResultPage() {
  return (
    <Suspense fallback={null}>
      <SocialResultView />
    </Suspense>
  );
}
