import { CommentReportStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListCommentReportsQueryDto {
  @IsOptional()
  @IsEnum(CommentReportStatus)
  status?: CommentReportStatus;
}
