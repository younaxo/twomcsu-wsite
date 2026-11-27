import { Allow } from 'class-validator';

/// Поля проверяются в VotingService уже после секрета: отсутствующий или
/// неверный секрет всегда даёт единый 401, а не 400 валидации (ответ не должен
/// различать причину до аутентификации). Тип и длина — в сервисе.
export class VoteWebhookDto {
  @Allow()
  secret?: unknown;

  @Allow()
  username?: unknown;

  @Allow()
  externalId?: unknown;
}
