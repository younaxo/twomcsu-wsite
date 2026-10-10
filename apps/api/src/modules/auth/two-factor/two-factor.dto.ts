import { IsString, Length, Matches } from 'class-validator';

/// Код из приложения: ровно 6 цифр.
export class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'Код — 6 цифр из приложения' })
  code!: string;
}

/// Код для входа и отключения: 6 цифр TOTP или резервный код `xxxx-xxxx`.
export class TwoFactorLoginDto {
  @IsString()
  @Length(6, 20)
  code!: string;
}

export class TwoFactorDisableDto {
  @IsString()
  @Length(1, 72)
  password!: string;

  @IsString()
  @Length(6, 20)
  code!: string;
}
