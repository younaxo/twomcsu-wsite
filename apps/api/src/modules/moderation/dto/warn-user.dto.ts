import { IsString, Length } from 'class-validator';

export class WarnUserDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;
}
