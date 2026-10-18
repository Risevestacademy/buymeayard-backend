import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
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
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsFeedResponseDto } from './dto/notification-feed.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get notifications feed',
    description:
      'Retrieves user notifications with pagination, category filtering, unread badge counter, and deep link action URLs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications feed retrieved successfully',
    type: NotificationsFeedResponseDto,
  })
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query() query: QueryNotificationsDto,
  ): Promise<NotificationsFeedResponseDto> {
    return this.notificationsService.getUserNotifications(userId, query);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark specific notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notificationsService.markAsRead(userId, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss or delete notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification deleted successfully' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async deleteNotification(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.deleteNotification(userId, id);
  }
}
