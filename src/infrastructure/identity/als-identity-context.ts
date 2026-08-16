import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { MissingIdentityError } from '../../domain/errors.ts';
import type { Identity, IdentityContext } from '../../domain/ports/identity-context.port.ts';

@Injectable()
export class AlsIdentityContext implements IdentityContext {
  private readonly storage = new AsyncLocalStorage<Identity>();

  run<T>(identity: Identity, fn: () => T): T {
    return this.storage.run(identity, fn);
  }

  require(): Identity {
    const identity = this.storage.getStore();
    if (!identity) throw new MissingIdentityError();
    return identity;
  }
}
