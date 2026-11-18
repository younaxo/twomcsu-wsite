// Кроссплатформенный запуск команды с явным NODE_ENV (без cross-env).
// Использование: node scripts/with-node-env.mjs <env> <команда> [аргументы...]
// NODE_ENV fail-closed (ADR-0164): пустой NODE_ENV = production, поэтому
// dev-скрипты (start:dev, start:debug) задают development явно.
import { spawn } from 'node:child_process';

const [nodeEnv, cmd, ...args] = process.argv.slice(2);
if (!nodeEnv || !cmd) {
  console.error(
    'Использование: node with-node-env.mjs <env> <команда> [args...]',
  );
  process.exit(2);
}

// На Windows nest — это .cmd-файл, без shell его не запустить. Аргументы
// приходят из статичных скриптов package.json (не из пользовательского ввода),
// поэтому shell на Windows допустим.
const child = spawn(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NODE_ENV: nodeEnv },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
