import { CalendarEventCategory, CalendarEventVisibility } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'slug может содержать только строчные латинские буквы, цифры и дефис',
  })
  @Length(1, 100)
  slug!: string;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsString()
  @Length(1, 10_000)
  description!: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsEnum(CalendarEventCategory)
  category!: CalendarEventCategory;

  @IsOptional()
  @IsEnum(CalendarEventVisibility)
  visibility?: CalendarEventVisibility;

  @IsISO8601()
  startsAt!: string;

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
}
