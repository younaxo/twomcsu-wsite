import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @Length(2, 64)
  name!: string;

  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug: только латиница в нижнем регистре, цифры и дефис',
  })
  slug!: string;

  @IsString()
  @Length(2, 64)
  displayName!: string;

  @IsInt()
  priority!: number;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isAssignable?: boolean;
}
