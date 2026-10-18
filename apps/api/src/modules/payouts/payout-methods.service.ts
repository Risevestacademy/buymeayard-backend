import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PayoutMethod } from '@prisma/client';
import { KycStatus } from '@buymeayard/types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  Bank,
  PAYMENT_PROVIDER,
  PaymentProviderRejectedError,
} from '../../infrastructure/payments/payment-provider.interface';
import type { PaymentProvider } from '../../infrastructure/payments/payment-provider.interface';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  BankAccountInputDto,
  PayoutMethodDto,
  ResolvedAccountDto,
} from './dto/payout-method.dto';

const BANK_LIST_TTL_MS = 24 * 60 * 60 * 1000;
/** Long enough to confirm "Is this you?" and save without a second lookup. */
const RESOLVED_ACCOUNT_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class PayoutMethodsService {
  private readonly logger = new Logger(PayoutMethodsService.name);
  private bankCache: { banks: Bank[]; expiresAt: number } | null = null;
  private resolvedAccounts = new Map<
    string,
    { account: ResolvedAccountDto; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async listBanks(): Promise<Bank[]> {
    if (this.bankCache && this.bankCache.expiresAt > Date.now()) {
      return this.bankCache.banks;
    }
    const banks = await this.callProvider(() =>
      this.paymentProvider.listBanks(),
    );
    banks.sort((a, b) => a.name.localeCompare(b.name));
    this.bankCache = { banks, expiresAt: Date.now() + BANK_LIST_TTL_MS };
    return banks;
  }

  /** Looks up the account name with the bank. Nothing is saved. */
  async resolveAccount(
    userId: string,
    input: BankAccountInputDto,
  ): Promise<ResolvedAccountDto> {
    await this.getVerifiedCreator(userId);
    return this.resolve(input);
  }

  /**
   * Saves the account as the creator's payout account. The account name is
   * looked up again server-side rather than trusted from the client, and the
   * previous account stays active until this one is saved.
   */
  async savePayoutMethod(
    userId: string,
    input: BankAccountInputDto,
  ): Promise<PayoutMethodDto> {
    const creator = await this.getVerifiedCreator(userId);
    const resolved = this.takeResolved(input) ?? (await this.resolve(input));
    const recipientCode = await this.callProvider(() =>
      this.paymentProvider.createTransferRecipient({
        accountName: resolved.accountName,
        accountNumber: resolved.accountNumber,
        bankCode: resolved.bankCode,
      }),
    );

    const method = await this.prisma.$transaction(async (tx) => {
      await tx.payoutMethod.updateMany({
        where: { creatorId: creator.id, status: 'ACTIVE' },
        data: { status: 'INACTIVE', isDefault: false },
      });
      return tx.payoutMethod.create({
        data: {
          creatorId: creator.id,
          accountIdentifier: resolved.accountNumber,
          accountName: resolved.accountName,
          bankName: resolved.bankName,
          bankCode: resolved.bankCode,
          recipientCode,
          status: 'ACTIVE',
          isDefault: true,
          verifiedAt: new Date(),
        },
      });
    });

    return PayoutMethodsService.toDto(method);
  }

  /** The account withdrawals are sent to, or null if none is set up. */
  async getActiveMethod(creatorId: string): Promise<PayoutMethod | null> {
    return this.prisma.payoutMethod.findFirst({
      where: { creatorId, status: 'ACTIVE' },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static toDto(method: PayoutMethod): PayoutMethodDto {
    return {
      id: method.id,
      bankName: method.bankName,
      bankCode: method.bankCode,
      accountName: method.accountName,
      accountNumberLast4: method.accountIdentifier.slice(-4),
      verified: !!method.verifiedAt,
    };
  }

  private async resolve(
    input: BankAccountInputDto,
  ): Promise<ResolvedAccountDto> {
    const banks = await this.listBanks();
    const bank = banks.find((b) => b.code === input.bankCode);
    if (!bank) {
      throw new BadRequestException({
        code: ErrorCodes.BANK_NOT_SUPPORTED,
        message: 'Choose a supported bank',
      });
    }

    try {
      const result = await this.paymentProvider.resolveAccount(
        input.accountNumber,
        input.bankCode,
      );
      const account = {
        accountName: result.accountName,
        accountNumber: input.accountNumber,
        bankCode: bank.code,
        bankName: bank.name,
      };
      this.rememberResolved(account);
      return account;
    } catch (error) {
      if (error instanceof PaymentProviderRejectedError) {
        throw new BadRequestException({
          code: ErrorCodes.BANK_ACCOUNT_UNVERIFIED,
          message: 'We couldn’t verify that account',
        });
      }
      throw this.unavailable(error);
    }
  }

  /**
   * Paystack test mode allows only 3 account lookups a day, so the lookup the
   * creator just confirmed is reused when they save. Server-side, not
   * client-supplied, so the saved name is still the bank's.
   */
  private rememberResolved(account: ResolvedAccountDto) {
    const now = Date.now();
    for (const [key, entry] of this.resolvedAccounts) {
      if (entry.expiresAt <= now) this.resolvedAccounts.delete(key);
    }
    this.resolvedAccounts.set(`${account.bankCode}:${account.accountNumber}`, {
      account,
      expiresAt: now + RESOLVED_ACCOUNT_TTL_MS,
    });
  }

  private takeResolved(input: BankAccountInputDto): ResolvedAccountDto | null {
    const key = `${input.bankCode}:${input.accountNumber}`;
    const entry = this.resolvedAccounts.get(key);
    this.resolvedAccounts.delete(key);
    return entry && entry.expiresAt > Date.now() ? entry.account : null;
  }

  private async getVerifiedCreator(userId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: { id: true, kycStatus: true },
    });
    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator profile not found',
      });
    }
    if (creator.kycStatus !== KycStatus.VERIFIED) {
      throw new BadRequestException({
        code: ErrorCodes.KYC_REQUIRED,
        message: 'Verify your identity before adding a payout account',
      });
    }
    return creator;
  }

  private async callProvider<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  private unavailable(error: unknown) {
    this.logger.error('Bank lookup failed', error);
    return new ServiceUnavailableException({
      code: ErrorCodes.BANK_SERVICE_UNAVAILABLE,
      message: 'We couldn’t reach the bank right now. Please try again.',
    });
  }
}
