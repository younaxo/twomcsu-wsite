import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateInventoryPrivacyBody {
  @IsOptional()
  @IsBoolean()
  inventoryPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  enderPublic?: boolean;
}
