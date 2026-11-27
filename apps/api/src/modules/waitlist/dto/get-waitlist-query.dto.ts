import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetWaitlistQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: 'Search waitlist by email keyword',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
