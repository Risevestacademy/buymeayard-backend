import { Sse } from '@nestjs/common';
import { of, lastValueFrom, toArray } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';
import { buildPagination } from '../utils/pagination.util';

describe('TransformInterceptor', () => {
  it('envelopes a paginated result as data: { items, pagination }', async () => {
    const page = { items: [{ id: 1 }], pagination: buildPagination(1, 10, 1) };

    const res = await lastValueFrom(
      new TransformInterceptor().intercept({} as never, {
        handle: () => of(page),
      }),
    );

    expect(res).toEqual({
      data: {
        items: [{ id: 1 }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
      meta: {},
    });
  });

  it('leaves Server-Sent Events messages alone, whatever keys they have', async () => {
    class Stream {
      @Sse('stream')
      handle() {
        return of();
      }
    }
    const message = { type: 'gift', data: { supportId: 's1' }, id: '1' };

    const res = await lastValueFrom(
      new TransformInterceptor()
        .intercept({ getHandler: () => Stream.prototype.handle } as never, {
          handle: () => of(message),
        })
        .pipe(toArray()),
    );

    expect(res).toEqual([message]);
  });
});
