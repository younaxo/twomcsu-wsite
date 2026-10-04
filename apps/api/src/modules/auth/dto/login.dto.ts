import { IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  emailOrUsername!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}
