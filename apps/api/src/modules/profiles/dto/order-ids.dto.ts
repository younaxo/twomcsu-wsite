import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class OrderIdsDto {
  /// Полный новый порядок: id записей UserBadge / UserAward.
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids!: string[];
}
