import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckSlugDto {
  @ApiProperty({
    description: 'The username / handle / slug to check for availability',
    example: 'aesthetefisayo',
  })
  @IsString()
  @IsNotEmpty()
  slug!: string;
}

export class CheckSlugResponseDto {
  @ApiProperty({
    description: 'Whether the slug / username is available for registration',
    example: true,
  })
  available!: boolean;

  @ApiProperty({
    description: 'Sanitized slug',
    example: 'aesthetefisayo',
  })
  slug!: string;

  @ApiPropertyOptional({
    description: 'Explanation if the slug is not available or invalid',
    example: 'This handle is already taken',
  })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Helpful message or confirmation',
    example: 'Handle is available',
  })
  message?: string;

  @ApiPropertyOptional({
    description: 'Whether this is the current authenticated user’s own handle',
    example: false,
  })
  isCurrent?: boolean;
}
