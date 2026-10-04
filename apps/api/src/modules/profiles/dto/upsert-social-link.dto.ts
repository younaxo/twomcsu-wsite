import { IsString, Length } from 'class-validator';

export class UpsertSocialLinkDto {
  @IsString()
  @Length(1, 200)
  value!: string;
}
