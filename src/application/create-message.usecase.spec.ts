import { BlankContentError } from '../domain/errors.ts';
import type { Message } from '../domain/message.ts';
import type { MessageCreatedEvent } from '../domain/message-created.event.ts';
import { CreateMessage } from './create-message.usecase.ts';

class FakeWriter {
  readonly saved: Message[] = [];
  async save(message: Message): Promise<void> {
    this.saved.push(message);
  }
}
class FakePublisher {
  readonly published: MessageCreatedEvent[] = [];
  async publish(event: MessageCreatedEvent): Promise<void> {
    this.published.push(event);
  }
}
const identity = { require: () => ({ tenantId: 'tenant-a', senderId: 'sender-1' }) };
const input = { conversationId: 'c1', content: 'hello', metadata: undefined };

describe('CreateMessage', () => {
  it('returns a view carrying the identity from the token, not the input', async () => {
    const useCase = new CreateMessage(new FakeWriter(), new FakePublisher(), identity);
    const view = await useCase.execute(input);
    expect(view.senderId).toBe('sender-1');
    expect(view.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('saves before it publishes', async () => {
    const order: string[] = [];
    const writer = {
      save: async () => {
        order.push('save');
      },
    };
    const publisher = {
      publish: async () => {
        order.push('publish');
      },
    };
    await new CreateMessage(writer, publisher, identity).execute(input);
    expect(order).toEqual(['save', 'publish']);
  });

  it('publishes the tenant on the event so the consumer needs no context', async () => {
    const publisher = new FakePublisher();
    await new CreateMessage(new FakeWriter(), publisher, identity).execute(input);
    expect(publisher.published[0]?.tenantId).toBe('tenant-a');
  });

  it('still returns the message when publishing fails', async () => {
    const writer = new FakeWriter();
    const publisher = {
      publish: async () => {
        throw new Error('broker down');
      },
    };
    const view = await new CreateMessage(writer, publisher, identity).execute(input);
    expect(view.content).toBe('hello');
    expect(writer.saved).toHaveLength(1);
  });

  it('does not persist content that is blank', async () => {
    const writer = new FakeWriter();
    const useCase = new CreateMessage(writer, new FakePublisher(), identity);
    await expect(useCase.execute({ ...input, content: '  ' })).rejects.toThrow(BlankContentError);
    expect(writer.saved).toHaveLength(0);
  });
});
