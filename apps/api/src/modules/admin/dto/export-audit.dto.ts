import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import {
  AUDIT_LOG_SEVERITIES,
  AuditLogSeverity,
} from './list-audit-log-query.dto';

export class ExportAuditDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsIn(AUDIT_LOG_SEVERITIES)
  severity?: AuditLogSeverity;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
