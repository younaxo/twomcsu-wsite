import { IsString, Length, Matches } from 'class-validator';

const UUID =
  /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;
const NAME = /^[A-Za-z0-9_]{3,16}$/;

/// Плагин: игрок ввёл `/site-connect`.
export class PluginSiteConnectDto {
  @Matches(UUID, { message: 'uuid' })
  uuid!: string;

  @Matches(NAME, { message: 'name' })
  name!: string;
}

/// Плагин: игрок ввёл `/site-connect <код>`.
export class PluginConfirmDto extends PluginSiteConnectDto {
  @IsString()
  @Length(3, 12)
  code!: string;
}

/// Сайт: открытие одноразовой ссылки.
export class OpenLinkDto {
  @IsString()
  @Length(16, 64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  token!: string;
}
