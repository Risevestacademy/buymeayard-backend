import { ApiProperty } from '@nestjs/swagger';

export class CurrencyOptionDto {
  @ApiProperty({ example: 'USD' })
  code!: string;

  @ApiProperty({
    example: 1500,
    description: 'Naira per 1 unit of this currency (1 for NGN)',
  })
  nairaPerUnit!: number;
}

export class CurrenciesResponseDto {
  @ApiProperty({
    example: 'US',
    nullable: true,
    type: String,
    description: "The visitor's two-letter country, or null when unknown",
  })
  country!: string | null;

  @ApiProperty({
    example: 'USD',
    description: 'The currency to open the support page in',
  })
  defaultCurrency!: string;

  @ApiProperty({ type: [CurrencyOptionDto] })
  currencies!: CurrencyOptionDto[];
}
