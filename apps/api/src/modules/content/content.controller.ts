import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('content')
@Controller()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Public()
  @Get('creators/:username/posts')
  @ApiOperation({ summary: 'Get published posts for a creator' })
  async getPosts(
    @Param('username') username: string,
    @CurrentUser('id') viewerUserId?: string,
  ) {
    return this.contentService.findPostsForCreator(username, viewerUserId);
  }
}
