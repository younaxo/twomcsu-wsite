import { IsString, Length } from 'class-validator';

export class ApplyPromoDto {
  @IsString()
  @Length(1, 32)
  code!: string;
}
