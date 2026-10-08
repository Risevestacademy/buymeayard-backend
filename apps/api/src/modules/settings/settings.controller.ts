import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentSession } from '../../common/decorators/current-session.decorator';
import { SettingsAccountResponseDto } from './dto/settings-account.dto';
import {
  DeleteAccountDto,
  DeleteAccountResponseDto,
} from './dto/delete-account.dto';
import { SettingsSecurityResponseDto } from './dto/settings-security.dto';
import {
  SessionsListResponseDto,
  RevokeSessionsResponseDto,
} from './dto/session-response.dto';
import {
  NotificationPreferencesResponseDto,
  UpdateNotificationPreferencesDto,
} from './dto/settings-notifications.dto';

@ApiTags('settings')
@ApiBearerAuth()
@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ---------------------------------------------------------------------------
  // TAB 1: ACCOUNT SETTINGS
  // ---------------------------------------------------------------------------

  @Get('me/settings/account')
  @ApiOperation({
    summary: 'Get account settings details',
    description:
      'Retrieves user profile details, verified name/email badges, public vanity page slug, and 4-state KYC verification card.',
  })
  @ApiResponse({
    status: 200,
    description: 'Account settings data retrieved successfully',
    type: SettingsAccountResponseDto,
  })
  async getAccountSettings(
    @CurrentUser('id') userId: string,
  ): Promise<SettingsAccountResponseDto> {
    return this.settingsService.getAccountSettings(userId);
  }

  @Delete('me/account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate and delete account',
    description:
      'Safely deactivates user and creator accounts, unpublishes profile, and invalidates all active sessions. Requires zero balance and no in-flight withdrawals.',
  })
  @ApiResponse({
    status: 200,
    description: 'Account successfully deactivated and deleted',
    type: DeleteAccountResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Cannot delete account due to unwithdrawn balance, pending withdrawals, or incorrect password.',
  })
  async deleteAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteAccountDto,
  ): Promise<DeleteAccountResponseDto> {
    return this.settingsService.deleteAccount(userId, dto);
  }

  // ---------------------------------------------------------------------------
  // TAB 2: SIGN-IN & SECURITY SETTINGS
  // ---------------------------------------------------------------------------

  @Get('me/settings/security')
  @ApiOperation({
    summary: 'Get sign-in methods & security overview',
    description:
      'Returns connected authentication providers (Email/Password, Google, Apple), password last changed timestamp, and disconnect guard indicators.',
  })
  @ApiResponse({
    status: 200,
    description: 'Security overview retrieved successfully',
    type: SettingsSecurityResponseDto,
  })
  async getSecuritySettings(
    @CurrentUser('id') userId: string,
  ): Promise<SettingsSecurityResponseDto> {
    return this.settingsService.getSecuritySettings(userId);
  }

  @Delete('me/settings/security/providers/:providerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disconnect social authentication provider',
    description:
      'Unlinks a connected social OAuth provider (Google or Apple). Rejects if it is the only remaining sign-in method.',
  })
  @ApiParam({
    name: 'providerId',
    enum: ['google', 'apple'],
    description: 'Social provider to disconnect',
  })
  @ApiResponse({
    status: 200,
    description: 'Provider unlinked successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot disconnect the only remaining login method.',
  })
  async disconnectProvider(
    @CurrentUser('id') userId: string,
    @Param('providerId') providerId: string,
  ) {
    return this.settingsService.disconnectProvider(userId, providerId);
  }

  // ---------------------------------------------------------------------------
  // ACTIVE SESSIONS & DEVICE MANAGEMENT
  // ---------------------------------------------------------------------------

  @Get('me/sessions')
  @ApiOperation({
    summary: 'List active sign-in sessions and devices',
    description:
      'Returns all active sessions with parsed device type, browser, OS, device label, IP address, location, and indicates which session is the current device.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active sessions retrieved successfully',
    type: SessionsListResponseDto,
  })
  async listSessions(
    @CurrentUser('id') userId: string,
    @CurrentSession('token') currentSessionToken?: string,
  ): Promise<SessionsListResponseDto> {
    return this.settingsService.listSessions(userId, currentSessionToken);
  }

  @Delete('me/sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a specific device session',
    description:
      'Invalidates a specific remote session. Rejects if the user attempts to revoke their own current active session.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Session ID to revoke',
  })
  @ApiResponse({
    status: 200,
    description: 'Session revoked successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot revoke current active session (use sign-out instead).',
  })
  async revokeSession(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
    @CurrentSession('token') currentSessionToken?: string,
  ) {
    return this.settingsService.revokeSession(
      userId,
      sessionId,
      currentSessionToken,
    );
  }

  @Post('me/sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign out of all other devices',
    description:
      'Invalidates all active sessions for the user except the one currently making this request.',
  })
  @ApiResponse({
    status: 200,
    description: 'All other sessions revoked successfully',
    type: RevokeSessionsResponseDto,
  })
  async revokeOtherSessions(
    @CurrentUser('id') userId: string,
    @CurrentSession('id') currentSessionId?: string,
    @CurrentSession('token') currentSessionToken?: string,
  ): Promise<RevokeSessionsResponseDto> {
    return this.settingsService.revokeOtherSessions(
      userId,
      currentSessionId,
      currentSessionToken,
    );
  }

  // ---------------------------------------------------------------------------
  // TAB 3: NOTIFICATION PREFERENCES
  // ---------------------------------------------------------------------------

  @Get('me/settings/notifications')
  @ApiOperation({
    summary: 'Get notification preferences',
    description:
      'Retrieves user notification preferences for email, in-app alerts, and mobile push across support activity, payouts, security, and marketing.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification preferences retrieved successfully',
    type: NotificationPreferencesResponseDto,
  })
  async getNotificationPreferences(
    @CurrentUser('id') userId: string,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.settingsService.getNotificationPreferences(userId);
  }

  @Patch('me/settings/notifications')
  @ApiOperation({
    summary: 'Update notification preferences',
    description:
      'Updates customizable channel toggles for support activity, tips, and platform updates. Critical financial and security transactional notices remain enforced.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification preferences updated successfully',
    type: NotificationPreferencesResponseDto,
  })
  async updateNotificationPreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.settingsService.updateNotificationPreferences(userId, dto);
  }
}
