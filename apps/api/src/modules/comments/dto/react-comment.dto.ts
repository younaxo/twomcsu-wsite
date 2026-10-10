import { IsIn } from 'class-validator';

/// Набор реакций на комментарии (ADR-0111): ключи, а не произвольный текст —
/// в поле нельзя записать слово или оскорбление. Иконки — на стороне web
/// (lucide, ADR-0085). Один пользователь — одна реакция на комментарий.
export const COMMENT_REACTIONS = [
  'like',
  'heart',
  'laugh',
  'fire',
  'wow',
] as const;

export class ReactCommentDto {
  @IsIn(COMMENT_REACTIONS, { message: 'Неизвестная реакция' })
  emoji!: (typeof COMMENT_REACTIONS)[number];
}
