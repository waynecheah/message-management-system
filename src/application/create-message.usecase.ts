import { Inject, Injectable, Logger } from '@nestjs/common';
import { Message } from '../domain/message.ts';
import { toEvent } from '../domain/message-created.event.ts';
import { toMessageView, type MessageView } from '../domain/message-view.ts';
import { EVENT_PUBLISHER, type EventPublisher } from '../domain/ports/event-publisher.port.ts';
import { IDENTITY_CONTEXT, type IdentityContext } from '../domain/ports/identity-context.port.ts';
import { MESSAGE_WRITER, type MessageWriter } from '../domain/ports/message-writer.port.ts';

export type CreateMessageInput = {
  conversationId: string;
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata: Record<string, any> | undefined;
};

@Injectable()
export class CreateMessage {
  private readonly logger = new Logger(CreateMessage.name);

  constructor(
    @Inject(MESSAGE_WRITER) private readonly writer: MessageWriter,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(IDENTITY_CONTEXT) private readonly identity: IdentityContext,
  ) {}

  async execute(input: CreateMessageInput): Promise<MessageView> {
    const { tenantId, senderId } = this.identity.require();
    const message = Message.create({ ...input, tenantId, senderId });

    await this.writer.save(message);

    try {
      await this.publisher.publish(toEvent(message));
    } catch (error) {
      // Never swallowed, never fatal: the message is in the system of record,
      // so failing the request would invite a duplicate retry (ADR-0011).
      this.logger.error(`message ${message.id} persisted but not published`, error);
    }

    return toMessageView(message);
  }
}
