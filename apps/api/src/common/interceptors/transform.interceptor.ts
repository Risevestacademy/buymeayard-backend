import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '@buymeayard/types';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    // A Server-Sent Events route streams its own { type, data } messages;
    // wrapping them would break the stream.
    const handler = context.getHandler?.();
    if (handler && Reflect.getMetadata(SSE_METADATA, handler)) {
      return next.handle() as Observable<ApiResponse<T>>;
    }

    return next.handle().pipe(
      map((response) => {
        // If response is already formatted as { data, meta }
        if (
          response &&
          typeof response === 'object' &&
          'data' in response &&
          ('meta' in response || Object.keys(response).length <= 2)
        ) {
          return response;
        }

        return {
          data: response ?? null,
          meta: {},
        };
      }),
    );
  }
}
