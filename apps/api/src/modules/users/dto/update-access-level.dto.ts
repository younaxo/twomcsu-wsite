import { IsInt, Max, Min } from 'class-validator';

/// Уровень доступа (ADR-0062) — отдельный числовой параметр, не priority роли.
export const ACCESS_LEVEL_MAX = 100;

export class UpdateAccessLevelDto {
  @IsInt()
  @Min(0)
  @Max(ACCESS_LEVEL_MAX)
  accessLevel!: number;
}
