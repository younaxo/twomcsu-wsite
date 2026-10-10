import { IsIn } from 'class-validator';

/// Набор реакций на записи активности (ADR-0114) — те же ключи, что у
/// комментариев и сообщений: не произвольный текст; иконки рисует web.
export const ACTIVITY_REACTIONS = [
  'like',
  'heart',
  'laugh',
  'fire',
  'wow',
] as const;

export class ReactActivityDto {
  @IsIn(ACTIVITY_REACTIONS, { message: 'Неизвестная реакция' })
  emoji!: (typeof ACTIVITY_REACTIONS)[number];
}
