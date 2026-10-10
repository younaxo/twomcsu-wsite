import { IsIn } from 'class-validator';

/// Набор реакций на комментарии новостей (ADR-0117) — те же ключи, что у
/// комментариев профиля, сообщений и ленты: не произвольный текст.
export const NEWS_COMMENT_REACTIONS = [
  'like',
  'heart',
  'laugh',
  'fire',
  'wow',
] as const;

export class ReactNewsCommentDto {
  @IsIn(NEWS_COMMENT_REACTIONS, { message: 'Неизвестная реакция' })
  emoji!: (typeof NEWS_COMMENT_REACTIONS)[number];
}
