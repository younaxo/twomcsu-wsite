import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class ReviewMediaRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  reviewNote?: string;
}
