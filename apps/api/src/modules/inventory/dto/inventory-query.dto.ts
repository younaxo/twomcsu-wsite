import { IsOptional, IsString, MaxLength } from 'class-validator';

/// Единственный допустимый параметр. Формат `server` проверяет сервис
/// (`422 invalid_param`), других параметров нет (ADR-0168, раздел 5).
export class InventoryMeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  server?: string;
}
