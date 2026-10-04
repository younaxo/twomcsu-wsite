import { IsOptional, IsString } from 'class-validator';

export class AssignRoleDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
