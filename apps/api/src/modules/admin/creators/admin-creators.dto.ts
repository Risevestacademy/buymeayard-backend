import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { CreatorStatus, KycStatus } from '@buymeayard/types';
import { AdminListQueryDto, AdminReasonDto } from '../dto/admin-query.dto';

export class AdminCreatorsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: CreatorStatus })
  @IsOptional()
  @IsEnum(CreatorStatus)
  status?: CreatorStatus;

  @ApiPropertyOptional({ enum: KycStatus })
  @IsOptional()
  @IsEnum(KycStatus)
  kycStatus?: KycStatus;

  @ApiPropertyOptional({ enum: ['newest', 'oldest'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort?: 'newest' | 'oldest';
}

export class AdminSetCreatorStatusDto extends AdminReasonDto {
  @ApiProperty({
    enum: [CreatorStatus.ACTIVE, CreatorStatus.SUSPENDED, CreatorStatus.BANNED],
    description: 'ACTIVE only works for a creator with verified, unblocked KYC',
  })
  @IsIn([CreatorStatus.ACTIVE, CreatorStatus.SUSPENDED, CreatorStatus.BANNED])
  status!:
    CreatorStatus.ACTIVE | CreatorStatus.SUSPENDED | CreatorStatus.BANNED;
}
