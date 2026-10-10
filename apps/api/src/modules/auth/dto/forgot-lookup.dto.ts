import { IsOptional, IsString, Length } from 'class-validator';

/// Восстановление по нику (A13): ник → маска e-mail аккаунта.
export class ForgotLookupDto {
  @IsString()
  @Length(3, 32)
  username!: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}
