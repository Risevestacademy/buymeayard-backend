import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminListQueryDto } from '../dto/admin-query.dto';

export class AdminTicketsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'RESOLVED'] })
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status?: 'OPEN' | 'RESOLVED';
}

export class AdminUpdateTicketDto {
  @ApiProperty({ enum: ['OPEN', 'RESOLVED'] })
  @IsIn(['OPEN', 'RESOLVED'])
  status!: 'OPEN' | 'RESOLVED';

  @ApiPropertyOptional({ description: 'Internal note (admins only)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  note?: string;
}
