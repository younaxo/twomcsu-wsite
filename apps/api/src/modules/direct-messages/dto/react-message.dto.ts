import { IsIn } from 'class-validator';

/// Набор реакций на сообщения (ADR-0112) — те же ключи, что у комментариев
/// профиля (ADR-0111): не произвольный текст; иконки рисует web (ADR-0085).
export const MESSAGE_REACTIONS = [
  'like',
  'heart',
  'laugh',
  'fire',
  'wow',
] as const;

export class ReactMessageDto {
  @IsIn(MESSAGE_REACTIONS, { message: 'Неизвестная реакция' })
  emoji!: (typeof MESSAGE_REACTIONS)[number];
}
