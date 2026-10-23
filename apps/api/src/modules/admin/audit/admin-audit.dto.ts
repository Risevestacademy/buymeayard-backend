import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminDateRangeQueryDto } from '../dto/admin-query.dto';

export class AdminAuditLogsQueryDto extends AdminDateRangeQueryDto {
  @ApiPropertyOptional({ description: 'User id of the admin who acted' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ example: 'admin.payout.retried' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ example: 'Payout' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceId?: string;
}
