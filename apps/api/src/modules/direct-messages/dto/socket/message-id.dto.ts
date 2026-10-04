import { IsString, Length } from 'class-validator';

export class MessageIdDto {
  @IsString()
  @Length(1, 40)
  messageId!: string;
}
