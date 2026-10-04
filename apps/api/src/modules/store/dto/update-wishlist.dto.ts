import { IsBoolean } from 'class-validator';

export class UpdateWishlistDto {
  @IsBoolean()
  isPublic!: boolean;
}
