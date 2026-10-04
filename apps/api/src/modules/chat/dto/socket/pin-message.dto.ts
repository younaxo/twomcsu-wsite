import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class PinMessageDto {
  @IsString()
  @Length(1, 40)
  messageId!: string;

  @IsOptional()
  @IsBoolean()
  unpin?: boolean;
}
