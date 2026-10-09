/// Имитация Minecraft-плагина для разработки (ADR-0072): отправляет те же
/// подписанные HMAC запросы, что и настоящий плагин, — чтобы пройти
/// регистрацию с привязкой Minecraft локально без игрового сервера.
///
///   pnpm --filter @twomc/api mc:plugin-sim connect <ник> [uuid]
///   pnpm --filter @twomc/api mc:plugin-sim confirm <ник> <uuid> <код>
///
/// Нужен `MINECRAFT_PLUGIN_SECRET` в локальном .env. Только для dev: в
/// production запросы шлёт сам плагин на сервере TwoMC.
import { randomUUID } from 'crypto';
import { signPluginRequest } from '../src/modules/minecraft-link/plugin-signature.guard';

async function call(path: string, body: Record<string, string>) {
  const secret = process.env.MINECRAFT_PLUGIN_SECRET;
  if (!secret) {
    throw new Error('MINECRAFT_PLUGIN_SECRET не задан в .env');
  }
  const base =
    process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-twomc-timestamp': ts,
      'x-twomc-signature': signPluginRequest(secret, ts, 'POST', path, body),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}: ${text}`);
}

async function main() {
  const [command, name, ...rest] = process.argv.slice(2);
  if (command === 'connect' && name) {
    const uuid = rest[0] ?? randomUUID();
    console.log(`uuid: ${uuid}`);
    await call('/minecraft/plugin/site-connect', { uuid, name });
    return;
  }
  if (command === 'confirm' && name && rest[0] && rest[1]) {
    await call('/minecraft/plugin/site-connect/confirm', {
      uuid: rest[0],
      name,
      code: rest[1],
    });
    return;
  }
  console.log(
    'Использование:\n  connect <ник> [uuid]\n  confirm <ник> <uuid> <код>',
  );
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
