import { IsString, IsUrl, MaxLength } from 'class-validator';

export class PushUnsubscribeDto {
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  endpoint!: string;
}
