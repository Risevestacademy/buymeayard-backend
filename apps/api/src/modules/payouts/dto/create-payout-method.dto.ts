import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePayoutMethodDto {
  @ApiProperty({
    description: '10-digit Nigerian NUBAN bank account number',
    example: '0123456789',
  })
  @IsString()
  @IsNotEmpty()
  @Length(10, 10, { message: 'Account number must be exactly 10 digits' })
  @Matches(/^[0-9]+$/, {
    message: 'Account number must contain only numeric digits',
  })
  accountNumber: string;

  @ApiProperty({
    description: '3-digit Central Bank of Nigeria (CBN) bank code',
    example: '058',
  })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({
    description: 'Official bank name (e.g. GTBank, Access Bank, Zenith Bank)',
    example: 'Guaranty Trust Bank',
  })
  @IsString()
  @IsNotEmpty()
  bankName: string;
}

export class PayoutMethodResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'Guaranty Trust Bank' })
  bankName: string;

  @ApiProperty({ example: 'Adeola Olawale' })
  accountName: string;

  @ApiProperty({ example: '******6789' })
  maskedAccountNumber: string;

  @ApiProperty({ example: true })
  isDefault: boolean;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: '2026-09-30T12:00:00.000Z' })
  createdAt: Date;
}
