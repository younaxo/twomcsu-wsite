import { IsBoolean, IsOptional } from 'class-validator';

export class PinModeratorNoteDto {
  /// По умолчанию true (закрепить); false — открепить.
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
