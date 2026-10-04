import { IsString, Length } from 'class-validator';

export class ValidatePromoDto {
  @IsString()
  @Length(1, 32)
  code!: string;
}
