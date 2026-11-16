// Кроссплатформенный запуск команды с явным NODE_ENV (без cross-env).
// Использование: node scripts/with-node-env.mjs <env> <команда...>
// NODE_ENV fail-closed (ADR-0164): пустой NODE_ENV = production, поэтому
// dev-скрипты задают development явно.
import { spawn } from 'node:child_process';

const [nodeEnv, ...command] = process.argv.slice(2);
if (!nodeEnv || command.length === 0) {
  console.error('Использование: node with-node-env.mjs <env> <команда...>');
  process.exit(2);
}

const child = spawn(command.join(' '), {
  stdio: 'inherit',
  shell: true,
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
