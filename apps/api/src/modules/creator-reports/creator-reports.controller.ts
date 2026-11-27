import {
  Body,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  UploadedFile,
  UseInterceptors,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Report a creator',
    description: `The **Report a creator** page. No sign-in needed, because supporters are guests. Limited to 5 reports per minute per IP.

Send it as **multipart/form-data** (the form can include a file). The creator comes from the \`slug\` in the URL, which is the "username of this creator" field.

- \`reason\` (required): \`BULLYING_AND_HARASSMENT\` (A), \`ILLEGAL_ACTIVITY\` (B), \`SEXUAL_CONTENT\` (C), \`HATE_SPEECH\` (D), \`MISLEADING_INFORMATION\` (E), \`SCAM_OR_FRAUD\` (F), \`INTELLECTUAL_PROPERTY\` (G), \`OTHER\` (H).
- \`description\` (required): what happened (1–2000 characters).
- \`evidenceLink1\` (required) and \`evidenceLink2\` (optional): links. A bare \`example.com\` gets \`https://\` added. Leave link 2 out or empty when unused.
- \`file\` (optional): one file, JPEG, PNG, WebP or PDF, max 10 MB.
- \`reporterEmail\` (required): so the team can follow up. Never shown to the creator.

The report is saved and emailed to the support inbox. If the email fails, the report is still saved and this still returns 201.

**On success:** show "Report sent".`,
  })
  @ApiParam({ name: 'slug', description: 'Public slug of the creator' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'SCAM_OR_FRAUD' },
        description: { type: 'string' },
        evidenceLink1: { type: 'string', example: 'https://example.com/proof' },
        evidenceLink2: { type: 'string' },
        reporterEmail: { type: 'string', example: 'name@example.com' },
        file: { type: 'string', format: 'binary' },
      },
      required: ['reason', 'description', 'evidenceLink1', 'reporterEmail'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Report saved. Show "Report sent".',
    type: ReportCreatorResponseDto,
  })
  @ApiErrors(
    {
      ...VALIDATION_ERROR,
      message: 'Tell us what happened',
      when: '`reason` is not one of the listed values, `description` or `evidenceLink1` is missing, a link is not a valid URL, `reporterEmail` is missing or not an email, or the file is the wrong type or over 10 MB.',
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
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^(image\/(jpeg|png|webp)|application\/pdf)$/,
            fallbackToMimetype: true,
          }),
        ],
      }),
    )
    file?: Express.Multer.File,
  ): Promise<ReportCreatorResponseDto> {
    return this.reports.report(slug, body, file);
  }
}
