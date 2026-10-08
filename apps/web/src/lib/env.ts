/// Публичные переменные окружения frontend. Только `NEXT_PUBLIC_*` — они
/// инлайнятся в бандл на этапе сборки, секретов здесь быть не может.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/+$/,
  '',
);
