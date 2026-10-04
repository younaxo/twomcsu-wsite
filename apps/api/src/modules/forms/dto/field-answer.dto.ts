import { IsOptional, IsString } from 'class-validator';

export class FieldAnswerDto {
  @IsString()
  fieldId!: string;

  /// Тип значения зависит от FormField.type (строка/число/булево/массив/
  /// дата) — проверяется сервисом по конкретному полю, не здесь.
  @IsOptional()
  value?: unknown;
}
