import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class DisplayBadgeDto {
  /// id UserBadge; null снимает выбранный бейдж.
  @ValidateIf((o: DisplayBadgeDto) => o.userBadgeId !== null)
  @IsString()
  @MaxLength(64)
  userBadgeId!: string | null;
}
