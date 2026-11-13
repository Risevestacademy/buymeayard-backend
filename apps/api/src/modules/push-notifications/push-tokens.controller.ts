import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PushTokensService } from './push-tokens.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UserThrottlerGuard } from './user-throttler.guard';

@ApiTags('push-tokens')
@ApiBearerAuth()
@UseGuards(UserThrottlerGuard)
@Controller('push-tokens')
export class PushTokensController {
  constructor(private readonly tokens: PushTokensService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Register or refresh an Expo push token',
    description:
      'Call on every app launch/login. Idempotent: the token is upserted, and reassigned to the caller if another user held it. The user comes from the session, never the body. Limited to 10 requests/min per user.',
  })
  @ApiResponse({ status: 200, description: '{ success: true }' })
  @ApiResponse({
    status: 400,
    description: 'Invalid token or platform',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterPushTokenDto,
  ) {
    await this.tokens.register(userId, dto);
    return { success: true };
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a push token (on logout)',
    description:
      'The token is URL-encoded in the path. Only the caller’s own token is removed. Returns 204 even if the token does not exist.',
  })
  @ApiResponse({ status: 204, description: 'Removed or not found' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('token') token: string,
  ): Promise<void> {
    await this.tokens.remove(userId, token);
  }
}
