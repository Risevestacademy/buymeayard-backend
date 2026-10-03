import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCodes } from '../errors/error-codes';
import { PostHogService } from '../../modules/analytics/posthog.service';

// Bodies on these routes carry identity data or signed provider payloads.
const OMIT_BODY_PATHS = [/^\/webhooks\//, /\/kyc(\/|$|\?)/];

const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'secret',
  'dateofbirth',
]);

function maskSensitive(value: unknown, depth = 0): unknown {
  if (depth > 5 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value))
    return value.map((v) => maskSensitive(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase())
        ? '[REDACTED]'
        : maskSensitive(v, depth + 1),
    ]),
  );
}

export function redactBody(url: string | undefined, body: unknown): unknown {
  if (url && OMIT_BODY_PATHS.some((re) => re.test(url))) return '[OMITTED]';
  return maskSensitive(body);
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly postHogService: PostHogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCodes.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj.message || exception.message;
        code = resObj.code || this.mapStatusToErrorCode(status);
        details =
          resObj.details ||
          (Array.isArray(resObj.message) ? resObj.message : undefined);
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception.message;
    }

    const request = ctx.getRequest();
    const logContext = {
      path: request.url,
      method: request.method,
      // redactBody drops bodies on webhook/KYC routes entirely;
      // sanitizeForLogging masks credential fields everywhere else.
      body: redactBody(request.url, this.sanitizeForLogging(request.body)),
      query: this.sanitizeForLogging(request.query),
      params: this.sanitizeForLogging(request.params),
      ip: request.ip,
      errorDetails: details,
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    if (status >= 500) {
      this.logger.error(`[${request.method} ${request.url}] ${message}`, {
        ...logContext,
      });
      if (exception instanceof Error) {
        this.postHogService.captureException(
          exception,
          request.user?.id ?? 'anonymous',
          {
            path: request.url,
            method: request.method,
            status_code: status,
          },
        );
      }
    } else {
      this.logger.warn(`[${request.method} ${request.url}] ${message}`, {
        ...logContext,
      });
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    });
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT;
      default:
        return ErrorCodes.INTERNAL_SERVER_ERROR;
    }
  }

  private sanitizeForLogging(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeForLogging(item));
    }

    const sensitiveFields = new Set([
      'password',
      'currentpassword',
      'newpassword',
      'confirmpassword',
      'token',
      'refreshtoken',
      'accesstoken',
      'secret',
      'cardnumber',
      'cvv',
      'authorization',
    ]);

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeForLogging(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
