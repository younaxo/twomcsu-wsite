import { IsObject } from 'class-validator';

/// Тело PUT: ключ из белого списка (`STORE_TEXT_KEYS`) -> текст. Значения
/// проверяет сервис (длина, управляющие символы).
export class UpdateStoreSettingsDto {
  @IsObject()
  values!: Record<string, unknown>;
}
