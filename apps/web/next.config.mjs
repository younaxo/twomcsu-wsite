import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone-сборка для Docker-образа (infrastructure/web.Dockerfile).
  output: 'standalone',
  // Версия сайта для футера берётся из package.json, build id — из CI/деплоя.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA ?? process.env.GITHUB_SHA ?? '',
  },
  transpilePackages: ['@twomc/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn-files.twomc.su' },
      { protocol: 'https', hostname: 'mc-heads.net' },
      { protocol: 'https', hostname: 'minotar.net' },
    ],
  },
};

export default nextConfig;
