import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Adeola Johnson',
    description: 'Updated display name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/.../avatar.jpg',
    description: 'Updated avatar image URL',
  })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Image must be a valid URL' })
  image?: string;
}
