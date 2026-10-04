import { IsString, Length } from 'class-validator';

export class ChannelIdDto {
  @IsString()
  @Length(1, 40)
  channelId!: string;
}
