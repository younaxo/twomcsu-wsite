import { IsArray, IsIP } from 'class-validator';

export class IpWhitelistDto {
  /// Полная замена списка (не добавление) — проще и предсказуемее для
  /// админки, чем add/remove-мутации над массивом.
  @IsArray()
  @IsIP(undefined, { each: true })
  ips!: string[];
}
