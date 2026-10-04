import { IsIn, IsOptional, IsString, Length } from 'class-validator';

/// Общая форма для review CommentReport/ProfileReport — оба enum-а статусов
/// (CommentReportStatus/ProfileReportStatus) имеют идентичный набор значений
/// помимо PENDING (RESOLVED/REJECTED), поэтому один DTO на оба эндпоинта.
export class ReviewContentReportDto {
  @IsIn(['RESOLVED', 'REJECTED'])
  status!: 'RESOLVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  reviewNote?: string;
}
