import { IsString, Matches } from 'class-validator';
import { GUEST_TOKEN_PATTERN } from '../guest-access-token';

/// Токен гостевого заказа передаётся в теле запроса, а не в URL (ADR-0186 Р4):
/// путь попадает в логи прокси, историю и Referer.
export class GuestOrderLookupDto {
  @IsString()
  @Matches(GUEST_TOKEN_PATTERN)
  token!: string;
}
