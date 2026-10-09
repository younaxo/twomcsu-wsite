/// sharp собран как CommonJS (`module.exports = sharp`), а его типы
/// объявлены как ESM default-export. Без esModuleInterop (включать нельзя —
/// ломает `import * as request from 'supertest'` во всех e2e) default-импорт
/// на рантайме даёт undefined. Единственная точка подключения — здесь.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharpImport = require('sharp');

export type SharpFactory = typeof import('sharp').default;

const candidate = sharpImport as unknown as { default?: SharpFactory };
export const sharp: SharpFactory =
  typeof candidate.default === 'function'
    ? candidate.default
    : (sharpImport as unknown as SharpFactory);
