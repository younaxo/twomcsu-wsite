/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone-сборка для Docker-образа (infrastructure/web.Dockerfile).
  output: 'standalone',
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
