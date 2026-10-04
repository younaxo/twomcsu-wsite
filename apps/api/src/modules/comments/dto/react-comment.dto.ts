import { IsString, Length } from 'class-validator';

/// CommentReaction.emoji — свободная строка (любой эмодзи), в отличие от
/// ProfileReaction.type (жёстко LIKE/DISLIKE). Один пользователь — одна
/// активная реакция на комментарий (смена эмодзи заменяет предыдущую).
export class ReactCommentDto {
  @IsString()
  @Length(1, 16)
  emoji!: string;
}
