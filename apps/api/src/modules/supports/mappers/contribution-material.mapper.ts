import { DashboardContributionMaterialDto } from '../../creators/dto/creator-dashboard.dto';

interface PlatformMaterialLook {
  color: string | null;
  thumbnailSmallUrl: string | null;
  imageUrl: string | null;
}

/**
 * The `material` object every contribution response carries, same shape as
 * the creator dashboard's: which fabric, its swatch and the yards gifted.
 */
export function toContributionMaterial(
  materialId: string,
  name: string,
  look: PlatformMaterialLook | null | undefined,
  yards: number,
): DashboardContributionMaterialDto {
  return {
    id: materialId,
    name,
    color: look?.color || null,
    thumbnailUrl: look?.thumbnailSmallUrl || look?.imageUrl || null,
    quantity: yards,
  };
}
