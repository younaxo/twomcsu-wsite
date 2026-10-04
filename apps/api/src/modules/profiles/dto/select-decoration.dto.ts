import { IsOptional, IsString } from 'class-validator';

export class SelectDecorationDto {
  /// null (или отсутствие поля) — снять декорацию.
  @IsOptional()
  @IsString()
  decorationId?: string | null;
}
