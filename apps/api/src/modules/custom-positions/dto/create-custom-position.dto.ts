import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateCustomPositionDto {
  @IsString()
  @Length(2, 64)
  name!: string;

  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug: только латиница в нижнем регистре, цифры и дефис',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}
