import { IsString, Length } from 'class-validator';
import { ReactMessageDto } from '../react-message.dto';

export class ReactMessageSocketDto extends ReactMessageDto {
  @IsString()
  @Length(1, 40)
  messageId!: string;
}
