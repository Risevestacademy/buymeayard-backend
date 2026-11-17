import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import {
  ApiErrors,
  VALIDATION_ERROR,
} from '../../common/decorators/api-errors.decorator';
import { IpThrottlerGuard } from './ip-throttler.guard';
import { CreatorReportsService } from './creator-reports.service';
import {
  ReportCreatorDto,
  ReportCreatorResponseDto,
} from './dto/report-creator.dto';

@ApiTags('creators')
@Controller('creators')
export class CreatorReportsController {
  constructor(private readonly reports: CreatorReportsService) {}

  @Public()
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':slug/report')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Report a creator',
    description: `The **Report a creator** page. No sign-in needed, because supporters are guests. Limited to 5 reports per minute per IP.

- \`reason\`: one of \`FRAUD_OR_SCAM\`, \`IMPERSONATION\`, \`INAPPROPRIATE_CONTENT\`, \`COPYRIGHT\`, \`HARASSMENT\`, \`OTHER\`.
- \`description\`: what happened (1–2000 characters, trimmed).
- \`reporterEmail\` (optional): so the team can follow up. It is never shown to the creator.

The report is saved and emailed to the support inbox. If the email fails, the report is still saved and this still returns 201.

**On success:** show "Report sent".`,
  })
  @ApiParam({ name: 'slug', description: 'Public slug of the creator' })
  @ApiResponse({
    status: 201,
    description: 'Report saved. Show "Report sent".',
    type: ReportCreatorResponseDto,
  })
  @ApiErrors(
    {
      ...VALIDATION_ERROR,
      message: 'Tell us what happened',
      when: '`reason` is not one of the listed values, `description` is empty or too long, or `reporterEmail` is not an email.',
    },
    {
      status: 404,
      code: 'CREATOR_NOT_FOUND',
      message: 'Creator not found',
      when: 'No published creator has this slug.',
    },
    {
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'ThrottlerException: Too Many Requests',
      when: 'More than 5 reports in a minute from this IP. Ask the user to try again shortly.',
    },
  )
  async report(
    @Param('slug') slug: string,
    @Body() body: ReportCreatorDto,
  ): Promise<ReportCreatorResponseDto> {
    return this.reports.report(slug, body);
  }
}
