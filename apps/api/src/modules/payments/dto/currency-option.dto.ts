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
