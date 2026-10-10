import { IsBoolean } from 'class-validator';

/// Видимость привязанного аккаунта в публичном профиле (ADR-0095).
export class LinkedAccountVisibilityDto {
  @IsBoolean()
  isPublic!: boolean;
}
