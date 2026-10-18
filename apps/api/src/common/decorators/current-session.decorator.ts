import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentSession = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const session = request.session;
    return data ? session?.[data] : session;
  },
);
