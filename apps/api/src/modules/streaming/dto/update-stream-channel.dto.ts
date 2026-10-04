import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

/// Намеренно не включает isLive/viewerCount/title/thumbnailUrl/liveUrl/
/// startedAt — эти поля обновляются только реальным опросом Twitch/YouTube
/// (refresh), не ручным PATCH, иначе админ мог бы создать фальшивый "live"
/// статус.
export class UpdateStreamChannelDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsBoolean()
  isPartner?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
