import { IsOptional, IsString } from 'class-validator';

export class AssignReportDto {
  /// null — снять назначение.
  @IsOptional()
  @IsString()
  assignedToId?: string | null;
}
