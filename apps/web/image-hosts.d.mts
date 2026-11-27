export interface RemotePattern {
  protocol: 'http' | 'https';
  hostname: string;
  port?: string;
  pathname?: string;
}
export const STATIC_REMOTE_PATTERNS: RemotePattern[];
export function buildRemotePatterns(env: Record<string, string | undefined>): RemotePattern[];
