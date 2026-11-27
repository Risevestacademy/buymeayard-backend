import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiPropertyOptional({
    description:
      'Current password for verification (required if account has password configured)',
    example: 'Password123!',
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description: 'Optional feedback or reason for deleting account',
    example: 'Closing store',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class DeleteAccountResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    example: 'Your account has been deactivated and deleted successfully.',
  })
  message!: string;
}
