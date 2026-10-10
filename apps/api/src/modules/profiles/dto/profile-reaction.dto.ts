import { IsIn, ValidateIf } from 'class-validator';

/// Реакция на профиль (B5): лайк, дизлайк или снять (`null`).
export class ProfileReactionDto {
  @ValidateIf((_, value) => value !== null)
  @IsIn(['LIKE', 'DISLIKE'])
  type!: 'LIKE' | 'DISLIKE' | null;
}
