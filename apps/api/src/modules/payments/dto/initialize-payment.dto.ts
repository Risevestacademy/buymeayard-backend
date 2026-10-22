import { IsEmail, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializePaymentDto {
  @ApiProperty({ description: 'The support id returned when it was created' })
  @IsUUID()
  supportId: string;

  @ApiPropertyOptional({
    example: 'jane@example.com',
    description:
      'Paystack receipt email. Falls back to the email given on the guest intent, then the signed-in supporter email.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
