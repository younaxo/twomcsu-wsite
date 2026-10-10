import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;

  /// Восстановление по нику (A13): ссылка уходит, только если `email`
  /// совпал с адресом аккаунта этого ника.
  @IsOptional()
  @IsString()
  @Length(3, 32)
  username?: string;
}
