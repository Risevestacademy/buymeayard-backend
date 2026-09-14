import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get profile of current authenticated user' })
  @ApiResponse({ status: 200, description: 'Profile returned successfully' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findByIdWithRoles(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile of current authenticated user' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user profile by user ID' })
  @ApiResponse({ status: 200, description: 'User found' })
  async getUserById(@Param('id') id: string) {
    return this.usersService.findByIdWithRoles(id);
  }
}
