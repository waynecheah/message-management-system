import { BlankContentError } from './errors.ts';
import { uuidV7 } from './uuid-v7.ts';

export type CreateMessageProps = {
  tenantId: string;
  conversationId: string;
  senderId: string;
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md defines metadata as Record<string, any>
  metadata: Record<string, any> | undefined;
};

/** Write-side entity. Read paths return MessageView instead (ADR-0020). */
export class Message {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly conversationId: string,
    readonly senderId: string,
    readonly content: string,
    readonly timestamp: Date,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
    readonly metadata: Record<string, any> | undefined,
  ) {}

  static create(props: CreateMessageProps): Message {
    if (props.content.trim().length === 0) throw new BlankContentError();
    const now = Date.now(); // one read: the id's millisecond and timestamp must agree
    return new Message(
      uuidV7(now),
      props.tenantId,
      props.conversationId,
      props.senderId,
      props.content,
      new Date(now),
      props.metadata,
    );
  }
}
