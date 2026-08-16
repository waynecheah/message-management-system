import { Inject, Injectable } from '@nestjs/common';
import type { MessageCreatedEvent } from '../domain/message-created.event.ts';
import { MESSAGE_INDEXER, type MessageIndexer } from '../domain/ports/message-indexer.port.ts';

@Injectable()
export class IndexMessage {
  constructor(@Inject(MESSAGE_INDEXER) private readonly indexer: MessageIndexer) {}

  /** Never catches: a swallowed failure would commit the offset past a lost document. */
  async execute(event: MessageCreatedEvent): Promise<void> {
    await this.indexer.index(event);
  }
}
