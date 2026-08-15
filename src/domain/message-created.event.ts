import type { Message } from './message.ts';

export type MessageCreatedEvent = {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly timestamp: string; // ISO-8601 — the payload crosses a JSON boundary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  readonly metadata?: Record<string, any>;
};

export function toEvent(m: Message): MessageCreatedEvent {
  return {
    id: m.id,
    tenantId: m.tenantId,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
    ...(m.metadata === undefined ? {} : { metadata: m.metadata }),
  };
}
