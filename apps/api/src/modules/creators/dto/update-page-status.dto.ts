import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePageStatusDto {
  @ApiProperty({
    example: true,
    description:
      'Publish status of creator page. If set to true, all setup requirements (creatorName, slug, bio, avatar, thankYouMessage, active materials) must be fulfilled.',
  })
  @IsBoolean()
  @IsNotEmpty()
  isPublished: boolean;
}
