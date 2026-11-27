import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { UserRole, UserStatus } from '@buymeayard/types';
import { AdminListQueryDto, AdminReasonDto } from '../dto/admin-query.dto';
import { ApiProperty } from '@nestjs/swagger';

export class AdminUsersQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class AdminSetUserStatusDto extends AdminReasonDto {
  @ApiProperty({
    enum: [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BANNED],
  })
  @IsIn([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BANNED])
  status!: UserStatus.ACTIVE | UserStatus.SUSPENDED | UserStatus.BANNED;
}
