import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/// Монорепо держит единый `.env` в корне, а Next.js читает `.env` только из
/// apps/web. Подхватываем из корневого файла ТОЛЬКО публичные `NEXT_PUBLIC_*`
/// (секреты API в бандл не попадают). Уже заданные переменные окружения
/// (CI, Docker build args) имеют приоритет.
function loadRootPublicEnv() {
  const file = new URL('../../.env', import.meta.url);
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined && value !== '') {
      process.env[key] = value;
    }
  }
}
loadRootPublicEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone-сборка для Docker-образа (infrastructure/web.Dockerfile, Linux).
  // На Windows с pnpm standalone кладёт в .next/standalone/node_modules ссылки
  // (junctions) на пакеты из node_modules/.pnpm, а очистка .next при следующем
  // `next dev` проходит по ним и стирает содержимое настоящих пакетов. Поэтому
  // локальная Windows-сборка — обычная (RISKS R19).
  output: process.platform === 'win32' ? undefined : 'standalone',
  // Версия сайта для футера берётся из package.json, build id — из CI/деплоя.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA ?? process.env.GITHUB_SHA ?? '',
  },
  transpilePackages: ['@twomc/shared'],
  // Ссылки старого сайта на профиль (`/users/<ник>`) ведут на `/u/<ник>` (срез 1.3).
  async redirects() {
    return [{ source: '/users/:username', destination: '/u/:username', permanent: true }];
  },
  // Service Worker (ADR-0086): всегда свежая версия, область — весь сайт.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn-files.twomc.su' },
      { protocol: 'https', hostname: 'mc-heads.net' },
      { protocol: 'https', hostname: 'minotar.net' },
    ],
  },
};

export default nextConfig;
