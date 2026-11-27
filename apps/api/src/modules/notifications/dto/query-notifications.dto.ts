import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class QueryNotificationsDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: ['PAYOUT', 'CONTRIBUTION', 'SECURITY', 'KYC', 'GENERAL'],
    description: 'Filter notifications by category',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter only unread notifications',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean = false;
}
