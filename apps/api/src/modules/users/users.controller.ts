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
import { UserMeResponseDto } from './dto/user-me-response.dto';
import {
  ApiErrors,
  UNAUTHORIZED_ERROR,
} from '../../common/decorators/api-errors.decorator';
import { UserRole } from '@buymeayard/types';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get profile of current authenticated user',
    description: `Returns the user, roles, creator profile summary, and setup flags:

| Flag | true when |
|---|---|
| \`isOnboardingCompleted\` / \`isProfileSetupCompleted\` | The creator finished onboarding |
| \`isKycCompleted\` | Identity verification approved (\`creatorProfile.kycStatus = VERIFIED\`) |
| \`isBankAccountConnected\` | A verified payout bank account is saved |

Non-creators get \`false\` for the creator flags. For balances and the payout account itself, use \`GET /creators/me/balance\`.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Profile returned successfully',
    type: UserMeResponseDto,
  })
  @ApiErrors(UNAUTHORIZED_ERROR)
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
  @ApiOperation({
    summary:
      'Get user profile (full details for self/admin, public profile for others)',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  async getUserById(@Param('id') id: string, @CurrentUser() currentUser: any) {
    const isSelf = currentUser?.id === id;
    const isAdmin =
      currentUser?.roles?.includes(UserRole.ADMIN) ||
      currentUser?.roles?.includes(UserRole.SUPER_ADMIN);

    if (isSelf || isAdmin) {
      return this.usersService.findByIdWithRoles(id);
    }

    return this.usersService.getPublicProfile(id);
  }
}
