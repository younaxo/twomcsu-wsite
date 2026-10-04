import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(3, 16)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message:
      'username может содержать только латинские буквы, цифры и подчёркивание',
  })
  username!: string;

  @IsString()
  @Length(8, 72)
  password!: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}
