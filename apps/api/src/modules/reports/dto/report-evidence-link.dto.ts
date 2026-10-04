import { IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class ReportEvidenceLinkDto {
  @IsString()
  @IsUrl({ require_protocol: false })
  url!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  type?: string;
}
