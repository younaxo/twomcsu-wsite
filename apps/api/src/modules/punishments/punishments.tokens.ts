/// Токены внедрения зависимостей модуля наказаний.
export const PUNISHMENT_SOURCE = Symbol('PUNISHMENT_SOURCE');
export const PUNISHMENTS_CONFIG = Symbol('PUNISHMENTS_CONFIG');
export const PUNISHMENTS_RUNTIME = Symbol('PUNISHMENTS_RUNTIME');

/// Часы, пауза и случайность вынесены, чтобы тесты были детерминированными.
export interface PunishmentsRuntime {
  now(): number;
  sleep(ms: number): Promise<void>;
  random(): number;
}

export const SYSTEM_RUNTIME: PunishmentsRuntime = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};
