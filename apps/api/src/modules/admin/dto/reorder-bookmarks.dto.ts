import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReorderBookmarksDto {
  /// Полный упорядоченный список id закладок текущего админа — `order`
  /// проставляется по индексу в массиве.
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}
