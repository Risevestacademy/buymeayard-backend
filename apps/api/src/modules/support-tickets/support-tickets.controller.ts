import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiErrors,
  UNAUTHORIZED_ERROR,
  VALIDATION_ERROR,
} from '../../common/decorators/api-errors.decorator';
import { SupportTicketsService } from './support-tickets.service';
import {
  CreateSupportTicketDto,
  SupportTicketResponseDto,
} from './dto/support-ticket.dto';

@ApiTags('support-tickets')
@ApiBearerAuth()
@ApiCookieAuth('better-auth.session_token')
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post()
  @ApiOperation({
    summary: 'Contact support',
    description: `The **Contact support** form: from a failed payout ("Need help with this payout?"), from a contribution, or from *Account → Contact support*.

- \`message\`: what happened (1–2000 characters, trimmed). Show "Don’t include your password or PIN." under the field.
- \`payoutId\` (optional): the payout's reference, amount, date and status are attached automatically ("Included automatically with your message"). Must be the signed-in creator's payout.
- \`contributionId\` (optional): the same for a contribution. The creator who received it can attach it.

The message is stored and emailed to the support inbox (\`SUPPORT_EMAIL\`). If the email fails, the ticket is still saved and this still returns 201.

**On success:** show "Message sent".`,
  })
  @ApiResponse({
    status: 201,
    description: 'Ticket created. Show "Message sent".',
    type: SupportTicketResponseDto,
  })
  @ApiErrors(
    {
      ...VALIDATION_ERROR,
      message: 'Tell us what happened',
      when: '`message` is empty, too long, or an ID is not a UUID.',
    },
    UNAUTHORIZED_ERROR,
    {
      status: 404,
      code: 'PAYOUT_NOT_FOUND',
      message: 'Payout not found',
      when: '`payoutId` doesn’t belong to the signed-in creator.',
    },
    {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Contribution not found',
      when: '`contributionId` wasn’t received or sent by the signed-in user.',
    },
  )
  async create(
    @CurrentUser('id') userId: string,
    @Body() body: CreateSupportTicketDto,
  ): Promise<SupportTicketResponseDto> {
    return this.supportTicketsService.create(userId, body);
  }
}
