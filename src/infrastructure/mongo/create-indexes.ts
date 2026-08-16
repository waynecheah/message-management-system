import type { Collection } from 'mongodb';
import type { MessageDocument } from './message.mapper.ts';

export const MESSAGES_INDEX_NAME = 'tenant_conversation_timestamp_id';

/** Declared explicitly: no ODM is doing it for us (ADR-0007). */
export async function createIndexes(collection: Collection<MessageDocument>): Promise<void> {
  await collection.createIndexes([
    {
      key: { tenantId: 1, conversationId: 1, timestamp: -1, _id: -1 },
      name: MESSAGES_INDEX_NAME,
    },
  ]);
}
