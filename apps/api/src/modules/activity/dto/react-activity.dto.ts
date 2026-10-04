import { IsString, Length } from 'class-validator';

export class ReactActivityDto {
  @IsString()
  @Length(1, 16)
  emoji!: string;
}
