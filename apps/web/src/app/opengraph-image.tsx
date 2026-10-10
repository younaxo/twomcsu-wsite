import { ImageResponse } from 'next/og';
import { SERVER_ADDRESS } from '@/lib/site/config';

/// OG-изображение по умолчанию (срез 8.4, ADR-0126): «Полдень», тёмная тема.
/// Только латиница — встроенный шрифт next/og без кириллицы.
export const alt = 'twomc.su';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const runtime = 'edge';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgb(23 23 21)',
        color: 'rgb(240 238 233)',
      }}
    >
      <div style={{ fontSize: 140, fontWeight: 800, letterSpacing: -4 }}>twomc.su</div>
      <div style={{ marginTop: 28, fontSize: 44, color: 'rgb(248 122 48)' }}>{SERVER_ADDRESS}</div>
      <div style={{ marginTop: 16, fontSize: 30, color: 'rgb(172 168 160)' }}>Minecraft</div>
    </div>,
    size,
  );
}
