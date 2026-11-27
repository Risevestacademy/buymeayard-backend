import { ApiProperty } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreatorProfileDataDto } from './creator-response.dto';

export class DiscoverCreatorsResponseDto {
  @ApiProperty({ type: [CreatorProfileDataDto] })
  items!: CreatorProfileDataDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}
