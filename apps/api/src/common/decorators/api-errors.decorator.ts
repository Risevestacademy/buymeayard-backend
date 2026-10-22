import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

export interface ApiErrorDoc {
  status: number;
  code: string;
  message: string;
  /** When the client gets this error and what it should do. */
  when: string;
}

/**
 * Documents an endpoint's error responses in Swagger: one response per HTTP
 * status, listing every code it can return, with a selectable example each.
 */
export function ApiErrors(...errors: ApiErrorDoc[]) {
  const byStatus = new Map<number, ApiErrorDoc[]>();
  for (const error of errors) {
    byStatus.set(error.status, [...(byStatus.get(error.status) ?? []), error]);
  }

  return applyDecorators(
    ...[...byStatus.entries()].map(([status, docs]) =>
      ApiResponse({
        status,
        type: ErrorResponseDto,
        description: docs.map((d) => `**${d.code}**: ${d.when}`).join('<br>'),
        examples: Object.fromEntries(
          docs.map((d) => [
            d.code,
            {
              summary: d.code,
              value: { error: { code: d.code, message: d.message } },
            },
          ]),
        ),
      }),
    ),
  );
}

/** Errors every authenticated endpoint can return. */
export const UNAUTHORIZED_ERROR: ApiErrorDoc = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required to access this resource',
  when: 'No session cookie or Bearer token, or the session expired. Sign the user in again.',
};

export const CREATOR_NOT_FOUND_ERROR: ApiErrorDoc = {
  status: 404,
  code: 'CREATOR_NOT_FOUND',
  message: 'Creator profile not found',
  when: 'The signed-in user has no creator profile (e.g. a supporter account).',
};

export const VALIDATION_ERROR: ApiErrorDoc = {
  status: 400,
  code: 'BAD_REQUEST',
  message: 'amount must be an integer number',
  when: 'The body or query failed validation. `message` describes the first invalid field.',
};
