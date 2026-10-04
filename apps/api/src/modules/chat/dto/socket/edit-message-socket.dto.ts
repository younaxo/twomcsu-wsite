import { IsString, Length } from 'class-validator';
import { EditMessageDto } from '../edit-message.dto';

export class EditMessageSocketDto extends EditMessageDto {
  @IsString()
  @Length(1, 40)
  messageId!: string;
}
