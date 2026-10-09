import type { Metadata } from 'next';
import { SiteConnectView } from './site-connect-view';

export const metadata: Metadata = {
  title: { absolute: 'twomc.su' },
  robots: { index: false, follow: false },
};

export default function SiteConnectPage({ params }: { params: { token: string } }) {
  return <SiteConnectView token={params.token} />;
}
