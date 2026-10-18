import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { PayoutMethodsService } from './payout-methods.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiErrorDoc,
  ApiErrors,
  CREATOR_NOT_FOUND_ERROR,
  UNAUTHORIZED_ERROR,
  VALIDATION_ERROR,
} from '../../common/decorators/api-errors.decorator';
import {
  BankAccountInputDto,
  BankDto,
  PayoutMethodDto,
  ResolvedAccountDto,
} from './dto/payout-method.dto';
import {
  ListPayoutsQueryDto,
  PayoutDetailDto,
  PayoutListDto,
  PayoutQuoteDto,
  QuotePayoutQueryDto,
  RequestPayoutDto,
} from './dto/payout.dto';

const KYC_REQUIRED_ERROR: ApiErrorDoc = {
  status: 400,
  code: 'KYC_REQUIRED',
  message: 'Verify your identity before adding a payout account',
  when: 'Identity is not verified yet. Send the creator to identity verification first (setupStep `VERIFY_IDENTITY`).',
};

const BANK_SERVICE_UNAVAILABLE_ERROR: ApiErrorDoc = {
  status: 503,
  code: 'BANK_SERVICE_UNAVAILABLE',
  message: 'We couldn’t reach the bank right now. Please try again.',
  when: 'Paystack is down, slow, or rate-limited (in test mode: more than 3 real account lookups in a day). Not the creator’s fault: show a retry message, **not** the "verification unsuccessful" screen.',
};

const BANK_ACCOUNT_ERRORS: ApiErrorDoc[] = [
  {
    ...VALIDATION_ERROR,
    message: 'Enter a valid 10-digit account number',
    when: 'Account number is not exactly 10 digits, or bank code is malformed. Show under the field (screen 1.2c).',
  },
  {
    status: 400,
    code: 'BANK_NOT_SUPPORTED',
    message: 'Choose a supported bank',
    when: 'The bank code is not in `GET /payouts/banks`.',
  },
  {
    status: 400,
    code: 'BANK_ACCOUNT_UNVERIFIED',
    message: 'We couldn’t verify that account',
    when: 'The bank could not confirm this account (wrong number, wrong bank, or inactive account). Show screen 1.5 "Bank verification unsuccessful". Nothing is saved.',
  },
  KYC_REQUIRED_ERROR,
  UNAUTHORIZED_ERROR,
  CREATOR_NOT_FOUND_ERROR,
  BANK_SERVICE_UNAVAILABLE_ERROR,
];

const IDEMPOTENCY_KEY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description:
    'Strongly recommended. A new UUID per withdrawal attempt (generate it when the creator lands on the Review screen). Retrying with the same key (double tap, timeout, app resumed) returns the **same** payout instead of withdrawing twice. Max 100 characters.',
  example: '3f0c7b8e-5d2a-4c1e-9b7f-0a1d2c3e4f5a',
};

@ApiTags('payouts')
@ApiBearerAuth()
@ApiCookieAuth('better-auth.session_token')
@Controller()
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly payoutMethodsService: PayoutMethodsService,
  ) {}

  // ---------------------------------------------------------------------------
  // BANK ACCOUNT
  // ---------------------------------------------------------------------------

  @Get('payouts/banks')
  @ApiOperation({
    summary: 'List banks supported for payouts',
    description: `Banks for the **Bank** search field on "Add bank account" (screens 1.2 / mobile 07).

- About 290 Nigerian banks from Paystack, sorted by name, cached on the server for 24 hours.
- Send the chosen bank's \`code\` to the resolve and save endpoints.
- In mock mode (\`PAYSTACK_SECRET_KEY\` containing \`mock\`) this is a short list of 7 common banks.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Banks, inside the standard `{ data, meta }` envelope.',
    type: [BankDto],
  })
  @ApiErrors(UNAUTHORIZED_ERROR, BANK_SERVICE_UNAVAILABLE_ERROR)
  async listBanks(): Promise<BankDto[]> {
    return this.payoutMethodsService.listBanks();
  }

  @Post('creators/me/payout-methods/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check a bank account and get the name on file',
    description: `Step 1 of adding or changing the payout account. **Nothing is saved.**

**Screens:** 1.3 "Checking with your bank…" while waiting → 1.4 "Is this you?" on success → 1.5 "Bank verification unsuccessful" on \`BANK_ACCOUNT_UNVERIFIED\`.

Show \`accountName\` and ask the creator to confirm. If they confirm, call \`POST /creators/me/payout-methods\` with the **same** \`bankCode\` and \`accountNumber\`. If not ("No, that's not right"), go back to the form.

Requires verified identity.

⚠️ **Paystack test mode allows only 3 real account lookups per day.** After that this returns \`503 BANK_SERVICE_UNAVAILABLE\` until the next day.`,
  })
  @ApiResponse({
    status: 200,
    description:
      'The bank confirmed the account. Show `accountName` for confirmation.',
    type: ResolvedAccountDto,
  })
  @ApiErrors(...BANK_ACCOUNT_ERRORS)
  async resolveAccount(
    @CurrentUser('id') userId: string,
    @Body() body: BankAccountInputDto,
  ): Promise<ResolvedAccountDto> {
    return this.payoutMethodsService.resolveAccount(userId, body);
  }

  @Post('creators/me/payout-methods')
  @ApiOperation({
    summary: 'Save the payout bank account (add or change)',
    description: `Step 2, after the creator taps **"Yes, save this account"**. Used for both **Add bank account** and **Change payout account** (screen 1.7).

- Send the same \`bankCode\` and \`accountNumber\` that were just resolved.
- The server never trusts a name from the client. It reuses the lookup it just did (kept 15 minutes) or looks the account up again, then registers the account with Paystack for transfers.
- A creator has **one** payout account. Saving a new one **replaces** the current one, and the old one stays active until this succeeds.
- Withdrawals already submitted keep going to the account they were sent to ("Pending withdrawals won't move").

**On success:** show "You're all set 🎉". \`GET /creators/me/balance\` now returns \`setupStep: "READY"\` and this account as \`payoutMethod\`, and \`/users/me\` returns \`isBankAccountConnected: true\`.`,
  })
  @ApiResponse({
    status: 201,
    description: 'Saved. This is now the account payouts are sent to.',
    type: PayoutMethodDto,
  })
  @ApiErrors(...BANK_ACCOUNT_ERRORS)
  async savePayoutMethod(
    @CurrentUser('id') userId: string,
    @Body() body: BankAccountInputDto,
  ): Promise<PayoutMethodDto> {
    return this.payoutMethodsService.savePayoutMethod(userId, body);
  }

  // ---------------------------------------------------------------------------
  // WITHDRAWALS
  // ---------------------------------------------------------------------------

  @Get('creators/me/payouts/quote')
  @ApiOperation({
    summary: 'Preview a withdrawal (fee and amount received)',
    description: `Powers the **Amount** step (2.3 / mobile 14–16) and the **Review** step (2.4). Call it as the creator types (debounce ~300 ms). It has no side effects.

**Processing fee** is taken **out of** the amount, not added on top:
| Withdrawal | Fee |
|---|---|
| up to ₦50,000 | ₦50 |
| above ₦50,000 | ₦100 |

Example: ₦45,000 → fee ₦50 → bank receives ₦44,950, and the balance goes down by ₦45,000.

Always display \`fee\` and \`netAmount\` from this response. Don't hard-code the fee in the app.

**Validation:** \`isValid: false\` with \`error\`:
- \`BELOW_MINIMUM\`: show "Minimum withdrawal: ₦1,000".
- \`EXCEEDS_BALANCE\`: show "You can withdraw up to ₦{availableBalance}" / "Amount exceeds your available balance".

Disable **Continue** while \`isValid\` is false.`,
  })
  @ApiResponse({ status: 200, type: PayoutQuoteDto })
  @ApiErrors(VALIDATION_ERROR, UNAUTHORIZED_ERROR, CREATOR_NOT_FOUND_ERROR)
  async quote(
    @CurrentUser('id') userId: string,
    @Query() query: QuotePayoutQueryDto,
  ): Promise<PayoutQuoteDto> {
    return this.payoutsService.quote(userId, query.amount);
  }

  @Post('creators/me/payouts')
  @ApiOperation({
    summary: 'Withdraw earnings',
    description: `Called on **"Confirm withdrawal"** (screen 2.4).

**What happens:**
1. The full \`amount\` is taken from the available balance immediately, so it can't be spent twice.
2. \`amount − fee\` is sent to the saved bank account through Paystack.
3. The response is usually \`status: "IN_PROGRESS"\` → show 2.5 "Withdrawal submitted" with \`reference\`.
4. The final result arrives from Paystack, usually within 30 minutes. Poll \`GET /creators/me/payouts/:id\` or wait for the notification.
   - \`SUCCESSFUL\` → 2.6 "Withdrawal successful".
   - \`FAILED\` → 2.7 "Withdrawal failed". The **full amount, fee included**, goes back to the balance.

The response can already be \`FAILED\` if Paystack rejected the transfer outright. The balance is restored in that case too.

**Always send \`Idempotency-Key\`** (see header).

Requires verified identity, an active creator, a saved bank account, and \`amount\` ≥ ₦1,000 and ≤ available balance.`,
  })
  @ApiHeader(IDEMPOTENCY_KEY_HEADER)
  @ApiResponse({
    status: 201,
    description:
      'Payout created. Same shape as `GET /creators/me/payouts/:id`. Also returned (instead of a new payout) when the Idempotency-Key was already used.',
    type: PayoutDetailDto,
  })
  @ApiErrors(
    {
      status: 400,
      code: 'BELOW_MINIMUM_WITHDRAWAL',
      message: 'You need at least ₦1,000 to withdraw',
      when: 'Amount under ₦1,000. Show the "You’re below the minimum" modal (screen 21 / low_modal).',
    },
    {
      status: 400,
      code: 'INSUFFICIENT_FUNDS',
      message:
        'Requested payout (45500000) exceeds available balance (4500000)',
      when: 'Amount is more than the available balance (it may have changed since the quote). Refresh the balance.',
    },
    {
      status: 400,
      code: 'PAYOUT_METHOD_REQUIRED',
      message: 'Add a verified bank account before withdrawing',
      when: 'No saved bank account, or one saved before payouts went live. Send the creator to "Add bank account".',
    },
    {
      status: 400,
      code: 'INVALID_AMOUNT',
      message: 'Payout amount must be greater than 0',
      when: 'Amount is 0 or negative.',
    },
    {
      ...KYC_REQUIRED_ERROR,
      message: 'KYC verification is required before payouts can be requested',
    },
    VALIDATION_ERROR,
    UNAUTHORIZED_ERROR,
    {
      status: 403,
      code: 'CREATOR_NOT_ACTIVE',
      message: 'Payouts are not available for this account',
      when: 'The creator is suspended, banned or deactivated.',
    },
    CREATOR_NOT_FOUND_ERROR,
  )
  async requestPayout(
    @CurrentUser('id') userId: string,
    @Body() body: RequestPayoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PayoutDetailDto> {
    return this.payoutsService.requestPayout(
      userId,
      body.amount,
      idempotencyKey?.slice(0, 100) || undefined,
    );
  }

  @Get('creators/me/payouts')
  @ApiOperation({
    summary: 'Payout history',
    description: `The **Payout history** table (web) and list (mobile 05 / overview).

- **Tabs:** \`status=all | successful | failed | in_progress\`.
- **Sort:** \`sort=newest\` (default, "Newest first") or \`oldest\`.
- **Count badge** next to "Payout history": \`pagination.total\` (it follows the selected tab).
- **Web pagination:** \`page\` + \`limit\` (default 10, max 50). **Mobile infinite scroll:** keep increasing \`page\` until \`page >= totalPages\`.
- **Empty state** ("Your first payout starts here"): \`items\` is empty and \`total\` is 0 on the \`all\` tab.

Each row: date = \`requestedAt\`, bank account = \`destination\` ("GTBank ••••4589"), status, amount. Show \`amount\` (requested) or \`netAmount\` (received) as the design requires; both are returned.`,
  })
  @ApiResponse({ status: 200, type: PayoutListDto })
  @ApiErrors(
    {
      ...VALIDATION_ERROR,
      message:
        'status must be one of the following values: all, successful, failed, in_progress',
    },
    UNAUTHORIZED_ERROR,
    CREATOR_NOT_FOUND_ERROR,
  )
  async listPayouts(
    @CurrentUser('id') userId: string,
    @Query() query: ListPayoutsQueryDto,
  ): Promise<PayoutListDto> {
    return this.payoutsService.listPayouts(userId, query);
  }

  @Get('creators/me/payouts/:id')
  @ApiOperation({
    summary: 'Payout details',
    description: `The **Payout details** drawer (web) / sheet (mobile), and the Submitted → Successful / Failed screens (2.5–2.7).

Also the target of every payout notification: notifications carry \`data.payoutId\`.

| status | Show |
|---|---|
| \`IN_PROGRESS\` | "In Progress", Status row "Awaiting confirmation", "On the way to your bank" |
| \`SUCCESSFUL\` | "Successful", "Net received" = \`netAmount\`, Completed = \`processedAt\` |
| \`FAILED\` | "Failed", \`failureReason\`, and the breakdown "Transferred ₦0 / Fee charged ₦0 / Returned to balance" from \`breakdown\`. Offer "Contact support" (\`POST /support-tickets\` with this \`payoutId\`) |

On the Submitted screen you can poll this every 5–10 s until the status changes.`,
  })
  @ApiParam({ name: 'id', description: 'Payout ID (UUID)', format: 'uuid' })
  @ApiResponse({ status: 200, type: PayoutDetailDto })
  @ApiErrors(
    {
      ...VALIDATION_ERROR,
      message: 'Validation failed (uuid is expected)',
      when: '`id` is not a UUID.',
    },
    UNAUTHORIZED_ERROR,
    {
      status: 404,
      code: 'PAYOUT_NOT_FOUND',
      message: 'Payout not found',
      when: 'No payout with this ID belongs to the signed-in creator.',
    },
  )
  async getPayout(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayoutDetailDto> {
    return this.payoutsService.getPayout(userId, id);
  }
}
