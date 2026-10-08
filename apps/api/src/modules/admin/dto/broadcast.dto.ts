import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const ANNOUNCEMENT_TYPES = ['info', 'success', 'warning', 'danger'] as const;

export class BroadcastDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_TYPES)
  type?: (typeof ANNOUNCEMENT_TYPES)[number];

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsBoolean()
  isDismissible?: boolean;

  @IsOptional()
  @IsDateString()
  showUntil?: string;

  /// Имя роли (RBAC `Role.name`) — рассылка только пользователям с этой
  /// ролью; без значения — всем.
  @IsOptional()
  @IsString()
  targetRole?: string;
}
