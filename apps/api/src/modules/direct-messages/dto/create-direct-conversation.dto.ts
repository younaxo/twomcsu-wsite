import { IsString } from 'class-validator';

export class CreateDirectConversationDto {
  @IsString()
  username!: string;
}
