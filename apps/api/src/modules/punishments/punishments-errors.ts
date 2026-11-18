import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PunishmentErrorCode } from './api/punishments-api.types';

/// Ошибки модуля с `code` (контракт 6.3). Тела одинаковы для всех причин.
export const NOT_FOUND_MESSAGE = 'Наказание не найдено.';

function body(statusCode: number, code: PunishmentErrorCode, message: string) {
  return { statusCode, code, message };
}

export const punishmentNotFound = (): NotFoundException =>
  new NotFoundException(body(404, 'punishments_not_found', NOT_FOUND_MESSAGE));

export const punishmentsPublicDisabled = (): NotFoundException =>
  new NotFoundException(
    body(404, 'punishments_public_disabled', 'Раздел не найден.'),
  );

export const punishmentsUnavailable = (): ServiceUnavailableException =>
  new ServiceUnavailableException(
    body(503, 'punishments_unavailable', 'Данные временно недоступны.'),
  );

export const issuerHideForbidden = (): ForbiddenException =>
  new ForbiddenException(
    body(
      403,
      'punishments_issuer_hide_forbidden',
      'Недостаточно прав для изменения скрытия выдавшего.',
    ),
  );
