import { CalendarEventCategory, CalendarEventVisibility } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10_000)
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsEnum(CalendarEventCategory)
  category?: CalendarEventCategory;

  @IsOptional()
  @IsEnum(CalendarEventVisibility)
  visibility?: CalendarEventVisibility;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  location?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  server?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number;

  @IsOptional()
  @IsISO8601()
  registrationDeadline?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
