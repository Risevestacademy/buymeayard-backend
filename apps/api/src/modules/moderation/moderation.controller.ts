import { Controller, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ModerationService } from './moderation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('moderation')
@ApiBearerAuth()
@Controller()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post('posts/:id/report')
  @ApiOperation({ summary: 'Report a post for moderation' })
  async reportPost(
    @CurrentUser('id') reporterId: string,
    @Param('id') contentId: string,
    @Body() body: { reason: string; description?: string },
  ) {
    return this.moderationService.reportContent(
      reporterId,
      contentId,
      body.reason,
      body.description,
    );
  }
}
