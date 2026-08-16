import type { MessageCreatedEvent } from '../message-created.event.ts';

export interface MessageIndexer {
  index(event: MessageCreatedEvent): Promise<void>;
}

export const MESSAGE_INDEXER = Symbol('MessageIndexer');
