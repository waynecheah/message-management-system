import { Binary, UUID } from 'mongodb';
import type { Message } from '../../domain/message.ts';
import type { MessageView } from '../../domain/message-view.ts';

export type MessageDocument = {
  _id: Binary;
  tenantId: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata?: Record<string, any>;
};

/** The only place id <-> _id translation happens (ADR-0008). */
export const toBinaryId = (id: string): UUID => new UUID(id);
export const toStringId = (binary: Binary): string => binary.toUUID().toString();

export function toDocument(m: Message): MessageDocument {
  return {
    _id: toBinaryId(m.id),
    tenantId: m.tenantId,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    timestamp: m.timestamp,
    ...(m.metadata === undefined ? {} : { metadata: m.metadata }),
  };
}

export function toView(doc: MessageDocument): MessageView {
  return {
    id: toStringId(doc._id),
    conversationId: doc.conversationId,
    senderId: doc.senderId,
    content: doc.content,
    timestamp: doc.timestamp,
    ...(doc.metadata === undefined ? {} : { metadata: doc.metadata }),
  };
}
