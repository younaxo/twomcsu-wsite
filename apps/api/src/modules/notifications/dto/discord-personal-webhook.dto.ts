import { IsString, IsUrl } from 'class-validator';

export class DiscordPersonalWebhookDto {
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string;
}
