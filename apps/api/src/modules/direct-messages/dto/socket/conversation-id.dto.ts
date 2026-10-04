import { IsString, Length } from 'class-validator';

export class ConversationIdDto {
  @IsString()
  @Length(1, 40)
  conversationId!: string;
}
