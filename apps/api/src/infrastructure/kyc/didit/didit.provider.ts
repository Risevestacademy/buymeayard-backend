import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingHttpHeaders } from 'http';
import { KycProviderName } from '@buymeayard/types';
import { ErrorCodes } from '../../../common/errors/error-codes';
import {
  CreateKycSessionParams,
  KycDecision,
  KycManualDecision,
  KycProvider,
  KycSessionResult,
  KycWebhookVerification,
} from '../kyc-provider.interface';
import {
  mapDiditStatus,
  redactDiditWebhook,
  summarizeDiditDecision,
  toAdminDecisionView,
  toDiditDocumentTypes,
} from './didit.mapper';
import { verifyDiditSignature } from './didit-signature';

const REQUEST_TIMEOUT_MS = 10_000;

type Json = Record<string, unknown>;

@Injectable()
export class DiditProvider implements KycProvider {
  readonly providerName = KycProviderName.DIDIT;
  private readonly logger = new Logger(DiditProvider.name);
  private readonly apiKey: string;
  private readonly workflowId: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('DIDIT_API_KEY') || '';
    this.workflowId = configService.get<string>('DIDIT_WORKFLOW_ID') || '';
    this.webhookSecret =
      configService.get<string>('DIDIT_WEBHOOK_SECRET') || '';
    this.baseUrl = (
      configService.get<string>('DIDIT_BASE_URL') ||
      'https://verification.didit.me'
    ).replace(/\/+$/, '');
  }

  async createSession(
    params: CreateKycSessionParams,
  ): Promise<KycSessionResult> {
    this.assertConfigured();
    const { expectedDetails } = params;
    const hasExpected = Boolean(
      expectedDetails &&
        (expectedDetails.firstName ||
          expectedDetails.lastName ||
          expectedDetails.dateOfBirth ||
          expectedDetails.country ||
          expectedDetails.documentType),
    );

    const body = await this.request('POST', '/v3/session/', {
      workflow_id: this.workflowId,
      vendor_data: params.vendorData,
      callback: params.callbackUrl,
      ...(params.email
        ? {
            contact_details: {
              email: params.email,
              send_notification_emails: false,
            },
          }
        : {}),
      ...(hasExpected && expectedDetails
        ? {
            expected_details: {
              ...(expectedDetails.firstName
                ? { first_name: expectedDetails.firstName }
                : {}),
              ...(expectedDetails.lastName
                ? { last_name: expectedDetails.lastName }
                : {}),
              ...(expectedDetails.dateOfBirth
                ? { date_of_birth: expectedDetails.dateOfBirth }
                : {}),
              ...(expectedDetails.country
                ? { id_country: expectedDetails.country }
                : {}),
              ...(expectedDetails.documentType
                ? {
                    expected_document_types: toDiditDocumentTypes(
                      expectedDetails.documentType,
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });

    const sessionId =
      typeof body.session_id === 'string' ? body.session_id : '';
    const sessionToken =
      typeof body.session_token === 'string' ? body.session_token : '';
    const rawUrl = body.url ?? body.verification_url;
    const url = typeof rawUrl === 'string' ? rawUrl : '';

    if (!sessionId || !sessionToken || !url) {
      this.logger.error(
        'Didit create session response missing required fields',
      );
      throw this.providerError();
    }

    const providerStatus =
      typeof body.status === 'string' ? body.status : 'Not Started';
    return {
      sessionId,
      sessionToken,
      url,
      providerStatus,
      status: mapDiditStatus(providerStatus),
      workflowId:
        typeof body.workflow_id === 'string' ? body.workflow_id : undefined,
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.assertConfigured();
    await this.request(
      'DELETE',
      `/v3/session/${encodeURIComponent(sessionId)}/delete/`,
      undefined,
      [404], // Already gone is fine
    );
  }

  async getDecision(sessionId: string): Promise<KycDecision> {
    this.assertConfigured();
    // A purged or deleted session returns 404: report "no status" (null) so
    // callers leave state untouched instead of failing forever.
    const body = await this.request(
      'GET',
      `/v3/session/${encodeURIComponent(sessionId)}/decision/`,
      undefined,
      [404],
    );
    const providerStatus =
      typeof body.status === 'string' ? body.status : 'Not Found';
    return {
      providerStatus,
      status: mapDiditStatus(providerStatus),
      summary: summarizeDiditDecision(body),
      adminView: toAdminDecisionView(body),
    };
  }

  async updateStatus(
    sessionId: string,
    decision: KycManualDecision,
    comment: string,
  ): Promise<void> {
    this.assertConfigured();
    await this.request(
      'PATCH',
      `/v3/session/${encodeURIComponent(sessionId)}/update-status/`,
      {
        new_status: decision === 'APPROVED' ? 'Approved' : 'Declined',
        comment,
      },
    );
  }

  verifyWebhook(
    headers: IncomingHttpHeaders,
    rawBody: Buffer | undefined,
  ): KycWebhookVerification {
    const result = verifyDiditSignature(this.webhookSecret, headers, rawBody);
    if (!result.isValid) return result;

    const p = result.payload;
    const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const sessionId = text(p.session_id);
    const providerStatus = text(p.status);
    const eventType = text(p.webhook_type) ?? 'unknown';
    const createdAt = typeof p.created_at === 'number' ? p.created_at : null;

    // Didit documents event_id as the idempotency key; fall back to the
    // documented composite key if it is ever absent.
    const eventId =
      text(p.event_id) ??
      `${sessionId}:${providerStatus}:${eventType}:${createdAt ?? String(p.timestamp)}`;

    return {
      isValid: true,
      event: {
        eventId,
        eventType,
        sessionId,
        vendorData: text(p.vendor_data),
        providerStatus,
        status: mapDiditStatus(providerStatus),
        environment: text(p.environment),
        workflowId: text(p.workflow_id),
        occurredAt: createdAt !== null ? new Date(createdAt * 1000) : null,
        summary: p.decision ? summarizeDiditDecision(p.decision) : null,
        redactedPayload: redactDiditWebhook(p),
      },
    };
  }

  private assertConfigured() {
    if (!this.apiKey || !this.workflowId) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.KYC_PROVIDER_ERROR,
        message: 'Identity verification is not configured',
      });
    }
  }

  private providerError() {
    return new BadGatewayException({
      code: ErrorCodes.KYC_PROVIDER_ERROR,
      message:
        'Identity verification provider is unavailable. Please try again.',
    });
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Json,
    allowedStatuses: number[] = [],
  ): Promise<Json> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'x-api-key': this.apiKey,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(
        `Didit ${method} ${path} failed: ${err instanceof Error ? err.message : err}`,
      );
      throw this.providerError();
    }

    if (!res.ok && !allowedStatuses.includes(res.status)) {
      // Error bodies are validation messages; truncate and never forward them.
      const detail = (await res.text().catch(() => '')).slice(0, 500);
      if (/enough credits/i.test(detail)) {
        // Free allowance used up and no prepaid balance: an ops problem,
        // not a user problem. Make it loud and distinct.
        this.logger.error(
          `DIDIT OUT OF CREDITS: ${method} ${path} refused (${res.status}). Top up at https://business.didit.me. Verifications are blocked until then.`,
        );
        throw new ServiceUnavailableException({
          code: ErrorCodes.KYC_UNAVAILABLE,
          message:
            'Identity verification is temporarily unavailable. Please try again later.',
        });
      }
      this.logger.error(
        `Didit ${method} ${path} returned ${res.status}: ${detail}`,
      );
      throw this.providerError();
    }

    if (res.status === 204 || !res.ok) return {};
    const text = await res.text();
    if (!text) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? (parsed as Json) : {};
    } catch {
      this.logger.error(`Didit ${method} ${path} returned non-JSON body`);
      throw this.providerError();
    }
  }
}
