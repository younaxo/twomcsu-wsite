import * as Joi from 'joi';

/// Валидируются только переменные, которые реально читает текущий код
/// (ADR: "Конфиг: нет валидации env" — docs/technical/42-TECH-DEBT.md — сознательно
/// не переносится в новый проект). Остальные переменные из .env.example
/// добавляются в схему по мере появления кода, который их использует.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  API_PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
}).unknown(true);
