import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

const upperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() || undefined : value;

/// Шаг 1: данные аккаунта (без пароля) + согласия → письмо с кодом.
export class RegisterStartDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(3, 16)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message:
      'Ник может содержать только латинские буквы, цифры и подчёркивание',
  })
  username!: string;

  /// Необязательный реферальный код пригласившего.
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @Matches(/^[A-Z0-9_]{3,24}$/, { message: 'Некорректный реферальный код' })
  referralCode?: string;

  /// Пользовательское соглашение и Правила проекта.
  @IsBoolean()
  @Equals(true, {
    message: 'Нужно принять Пользовательское соглашение и Правила',
  })
  acceptTerms!: boolean;

  /// Согласие на обработку персональных данных — отдельно.
  @IsBoolean()
  @Equals(true, { message: 'Нужно согласие на обработку персональных данных' })
  acceptPersonalData!: boolean;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}

export class RegisterVerifyDto {
  @IsString()
  @Length(10, 40)
  verificationId!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Код — 6 цифр' })
  code!: string;
}

export class RegisterResendDto {
  @IsString()
  @Length(10, 40)
  verificationId!: string;
}

/// Состояние регистрации для продолжения после перезагрузки (без пароля).
export class RegisterStateDto {
  @IsString()
  @Length(10, 40)
  verificationId!: string;

  @IsOptional()
  @IsString()
  @Length(32, 128)
  completionToken?: string;
}

/// Привязка Minecraft: шаг после подтверждения почты (ADR-0072).
export class RegisterMinecraftDto {
  @IsString()
  @Length(10, 40)
  verificationId!: string;

  @IsString()
  @Length(32, 128)
  completionToken!: string;
}

export class RegisterMinecraftCodeDto extends RegisterMinecraftDto {
  /// 15-символьный код со страницы /site-connect (пробелы/дефисы допустимы).
  @IsString()
  @Length(15, 40)
  code!: string;
}

/// Шаг 3: создание аккаунта — только с одноразовым токеном после верного кода.
export class RegisterCompleteDto {
  @IsString()
  @Length(10, 40)
  verificationId!: string;

  @IsString()
  @Length(32, 128)
  completionToken!: string;

  @IsString()
  @Length(8, 72)
  password!: string;
}
