import { CommentReportReason } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class ReportCommentDto {
  @IsEnum(CommentReportReason)
  reason!: CommentReportReason;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}
