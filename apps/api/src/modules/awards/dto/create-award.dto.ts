import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateAwardDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'slug может содержать только строчные латинские буквы, цифры и дефис',
  })
  @Length(1, 160)
  slug!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsString()
  iconUrl!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(common|rare|epic|legendary)$/)
  rarity?: string;
}
