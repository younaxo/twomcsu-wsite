import {
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateDonationProblemDto {
  @IsString()
  @Length(1, 5000)
  description!: string;

  @IsOptional()
  @IsISO8601()
  paymentDate?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
