import { IsString, Length } from 'class-validator';
import { SendMessageDto } from '../send-message.dto';

export class SendMessageSocketDto extends SendMessageDto {
  @IsString()
  @Length(1, 40)
  conversationId!: string;
}
