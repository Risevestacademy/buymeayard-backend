import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class BankDto {
  @ApiProperty({
    example: 'Guaranty Trust Bank',
    description: 'Name to show in the bank search',
  })
  name!: string;

  @ApiProperty({
    example: '058',
    description: 'Paystack bank code. Send it as `bankCode`.',
  })
  code!: string;

  @ApiProperty({ example: 'guaranty-trust-bank' })
  slug!: string;
}

export class BankAccountInputDto {
  @ApiProperty({
    example: '058',
    description: 'Bank code from GET /payouts/banks',
  })
  @IsString()
  @Matches(/^\d{3,6}$/, { message: 'Choose a supported bank' })
  bankCode!: string;

  @ApiProperty({
    example: '0123454589',
    description: '10-digit NUBAN account number',
  })
  @IsString()
  @Matches(/^\d{10}$/, { message: 'Enter a valid 10-digit account number' })
  accountNumber!: string;
}

export class ResolvedAccountDto {
  @ApiProperty({
    example: 'SHOSANYA ISAAC OLUWADAMILARE',
    description: 'The name the bank has on file. Show it on "Is this you?".',
  })
  accountName!: string;

  @ApiProperty({ example: '0123454589' })
  accountNumber!: string;

  @ApiProperty({ example: '058' })
  bankCode!: string;

  @ApiProperty({ example: 'Guaranty Trust Bank' })
  bankName!: string;
}

export class PayoutMethodDto {
  @ApiProperty({ example: '6f1c2c1e-1b0a-4d8e-9b0e-2f7c9a1d3e4f' })
  id!: string;

  @ApiProperty({ example: 'Guaranty Trust Bank' })
  bankName!: string;

  @ApiProperty({ example: '058', nullable: true })
  bankCode!: string | null;

  @ApiProperty({ example: 'SHOSANYA ISAAC OLUWADAMILARE' })
  accountName!: string;

  @ApiProperty({
    example: '4589',
    description:
      'Last 4 digits. Display as "•••• 4589". The full number is never returned.',
  })
  accountNumberLast4!: string;

  @ApiProperty({
    example: true,
    description: 'Account name was confirmed with the bank before saving',
  })
  verified!: boolean;
}
