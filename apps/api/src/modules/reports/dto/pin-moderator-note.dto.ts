import { IsBoolean, IsOptional } from 'class-validator';

export class PinModeratorNoteDto {
  /// PATCH .../pin только закрепляет: отсутствие поля и `true` — закрепить.
  /// `false` отвергается (400): открепление — только через
  /// DELETE .../notes/:noteId/pin под правом `reports.notes.unpin`.
  /// Поле оставлено ради обратной совместимости тела запроса.
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
