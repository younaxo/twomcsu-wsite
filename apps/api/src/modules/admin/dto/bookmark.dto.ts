import { IsOptional, IsString, MaxLength } from 'class-validator';

/// `url` — внутренний путь в админке (например `/admin/store/products`),
/// не обязательно абсолютный внешний URL.
export class BookmarkDto {
  @IsString()
  @MaxLength(300)
  url!: string;

  @IsString()
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsString()
  icon?: string;
}
