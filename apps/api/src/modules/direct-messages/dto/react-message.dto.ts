import { IsString, Length } from 'class-validator';

export class ReactMessageDto {
  @IsString()
  @Length(1, 16)
  emoji!: string;
}
