import { IsOptional, IsString, Length } from 'class-validator';

export class VoteWebhookDto {
  @IsString()
  @Length(1, 500)
  secret!: string;

  @IsString()
  @Length(1, 32)
  username!: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}
