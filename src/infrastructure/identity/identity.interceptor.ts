import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Identity } from '../../domain/ports/identity-context.port.ts';
import { AlsIdentityContext } from './als-identity-context.ts';

/**
 * An interceptor, not middleware and not the guard: middleware runs before the
 * token is verified, and a guard's canActivate returns rather than wrapping the
 * rest of the request (spec §1).
 */
@Injectable()
export class IdentityInterceptor implements NestInterceptor {
  constructor(private readonly context: AlsIdentityContext) {}

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = execution.switchToHttp().getRequest<{ user?: Identity }>();
    const identity = request.user;
    if (!identity) return next.handle(); // @Public() route: no store, require() will throw
    return new Observable((subscriber) =>
      this.context.run(identity, () => next.handle().subscribe(subscriber)),
    );
  }
}
