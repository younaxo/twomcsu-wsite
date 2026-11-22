import { IsString, MaxLength } from 'class-validator';

/// Токен гостевого заказа передаётся в теле запроса, а не в URL (ADR-0186 Р4):
/// путь попадает в логи прокси, историю и Referer. Формат НЕ проверяется
/// валидатором: неверный формат отвечает тем же 404, что и неизвестный токен
/// (сервис, ADR-0190), чтобы ответ не различал причины.
export class GuestOrderLookupDto {
  @IsString()
  @MaxLength(512)
  token!: string;
}
