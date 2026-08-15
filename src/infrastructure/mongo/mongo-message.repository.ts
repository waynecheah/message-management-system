import { Inject, Injectable } from '@nestjs/common';
import type { Collection, Filter } from 'mongodb';
import { encodeCursor } from '../../domain/cursor.ts';
import type { Message } from '../../domain/message.ts';
import type { MessageView } from '../../domain/message-view.ts';
import type { Page } from '../../domain/page.ts';
import {
  IDENTITY_CONTEXT,
  type IdentityContext,
} from '../../domain/ports/identity-context.port.ts';
import type { ListQuery, MessageReader } from '../../domain/ports/message-reader.port.ts';
import type { MessageWriter } from '../../domain/ports/message-writer.port.ts';
import { MESSAGES_COLLECTION } from './mongo-client.token.ts';
import {
  toBinaryId,
  toDocument,
  toStringId,
  toView,
  type MessageDocument,
} from './message.mapper.ts';

@Injectable()
export class MongoMessageRepository implements MessageWriter, MessageReader {
  constructor(
    @Inject(MESSAGES_COLLECTION) private readonly collection: Collection<MessageDocument>,
    @Inject(IDENTITY_CONTEXT) private readonly identity: IdentityContext,
  ) {}

  async save(message: Message): Promise<void> {
    await this.collection.insertOne(toDocument(message));
  }

  async listByConversation(query: ListQuery): Promise<Page<MessageView>> {
    const { tenantId } = this.identity.require(); // throws when absent — never a wildcard
    const ascending = query.direction === 'asc';

    const filter: Filter<MessageDocument> = { tenantId, conversationId: query.conversationId };
    if (query.cursor) {
      const boundId = toBinaryId(query.cursor.id); // the mapper owns id -> _id
      const at = query.cursor.timestamp;
      filter.$or = ascending
        ? [{ timestamp: { $gt: at } }, { timestamp: at, _id: { $gt: boundId } }]
        : [{ timestamp: { $lt: at } }, { timestamp: at, _id: { $lt: boundId } }];
    }

    const direction = ascending ? 1 : -1;
    const docs = await this.collection
      .find(filter)
      .sort({ timestamp: direction, _id: direction })
      .limit(query.limit + 1) // one lookahead row, never a count query
      .toArray();

    const hasMore = docs.length > query.limit;
    const page = hasMore ? docs.slice(0, query.limit) : docs;
    const last = page.at(-1);

    return {
      items: page.map(toView),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              timestamp: last.timestamp,
              id: toStringId(last._id),
              direction: query.direction,
            })
          : null,
    };
  }
}
