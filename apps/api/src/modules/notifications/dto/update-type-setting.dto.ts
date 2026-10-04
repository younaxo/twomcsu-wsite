import { IsBoolean } from 'class-validator';

export class UpdateTypeSettingDto {
  @IsBoolean()
  enabled!: boolean;
}
