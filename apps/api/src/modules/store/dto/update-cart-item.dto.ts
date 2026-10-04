import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateCartItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  giftToUsername?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  giftMessage?: string;
}
