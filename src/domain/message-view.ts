import type { Message } from './message.ts';

export type MessageView = {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly timestamp: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  readonly metadata?: Record<string, any>;
};

export function toMessageView(m: Message): MessageView {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    timestamp: m.timestamp,
    ...(m.metadata === undefined ? {} : { metadata: m.metadata }),
  };
}
