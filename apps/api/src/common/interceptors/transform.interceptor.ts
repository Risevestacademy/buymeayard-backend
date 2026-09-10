import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
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
