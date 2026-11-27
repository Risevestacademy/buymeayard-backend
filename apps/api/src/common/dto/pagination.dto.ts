import { ApiProperty } from '@nestjs/swagger';

/**
 * The one pagination block every page-based list returns, as
 * `data: { items, pagination }`.
 */
export class PaginationDto {
  @ApiProperty({ example: 1, description: 'Current page number' })
  page!: number;

  @ApiProperty({ example: 10, description: 'Page size' })
  limit!: number;

  @ApiProperty({ example: 67, description: 'Total items matching the filters' })
  total!: number;

  @ApiProperty({
    example: 7,
    description: 'Last page (at least 1). Stop paging when page >= totalPages.',
  })
  totalPages!: number;
}

/**
 * The pagination block every cursor-based feed returns, as
 * `data: { items, pagination }`.
 */
export class CursorPaginationDto {
  @ApiProperty({ example: 20, description: 'Page size' })
  limit!: number;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'eyJ0IjoiMjAyNi0xMC0wNlQxMDowMDowMFoifQ',
    description:
      'Pass as `cursor` to get the next page. Null when there are no more.',
  })
  nextCursor!: string | null;
}
