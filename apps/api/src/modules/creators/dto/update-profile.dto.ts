import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Adeola Johnson',
    description: 'Creator display name',
  })
  @IsOptional()
  @IsString()
  creatorName?: string;

  @ApiPropertyOptional({
    example: 'Fashion designer in Lagos creating everyday inspiration.',
    description: 'Creator bio / about text (max 160 characters)',
  })
  @IsOptional()
  @IsString()
  bio?: string;
}
