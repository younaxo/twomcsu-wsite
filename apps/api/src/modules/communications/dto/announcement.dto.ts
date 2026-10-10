import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/// Зеркало `ANNOUNCEMENT_KINDS` / `ANNOUNCEMENT_PLACEMENTS` из shared (ADR-0081).
export const ANNOUNCEMENT_KINDS = [
  'info',
  'important',
  'warning',
  'update',
  'event',
  'maintenance',
] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];
export const ANNOUNCEMENT_PLACEMENTS = [
  'banner',
  'notifications',
  'dashboard',
] as const;
export type AnnouncementPlacement = (typeof ANNOUNCEMENT_PLACEMENTS)[number];
export const ANNOUNCEMENT_AUDIENCES = ['all', 'users', 'role'] as const;

const LINK_PATTERN = /^(\/(?!\/)\S*|https:\/\/\S+)$/;

export class UpsertAnnouncementDto {
  @IsString()
  @Length(1, 120)
  title!: string;

  @IsString()
  @Length(1, 2000)
  message!: string;

  @IsIn(ANNOUNCEMENT_KINDS)
  kind!: AnnouncementKind;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MaxLength(500)
  @Matches(LINK_PATTERN, {
    message: 'Ссылка — внутренний путь /… или https://…',
  })
  link?: string | null;

  @IsOptional()
  @IsBoolean()
  isDismissible?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  showFrom?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  showUntil?: string | null;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_AUDIENCES)
  audience?: (typeof ANNOUNCEMENT_AUDIENCES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(1, 64)
  targetRole?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ANNOUNCEMENT_PLACEMENTS, { each: true })
  placements?: AnnouncementPlacement[];
}

export class ListAnnouncementsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class PublicAnnouncementsQueryDto {
  @IsOptional()
  @IsIn(['banner', 'dashboard'])
  placement?: 'banner' | 'dashboard';
}
