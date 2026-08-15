import { Message } from './message.ts';
import { BlankContentError } from './errors.ts';

const props = {
  tenantId: 't1',
  conversationId: 'c1',
  senderId: 's1',
  content: 'hello',
  metadata: undefined,
};

describe('Message.create', () => {
  it('generates a v7 id and a server timestamp', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
    const message = Message.create(props);
    expect(message.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(message.timestamp.toISOString()).toBe('2026-08-15T10:00:00.000Z');
    jest.useRealTimers();
  });

  it('derives the id and the timestamp from one clock read', () => {
    jest.useFakeTimers().setSystemTime(1_760_000_000_000);
    const message = Message.create(props);
    const embeddedMs = parseInt(message.id.replace(/-/g, '').slice(0, 12), 16);
    expect(embeddedMs).toBe(message.timestamp.getTime());
    jest.useRealTimers();
  });

  it('rejects blank content', () => {
    expect(() => Message.create({ ...props, content: '   ' })).toThrow(BlankContentError);
  });

  it('rejects content that sanitization reduced to nothing', () => {
    expect(() => Message.create({ ...props, content: '' })).toThrow(BlankContentError);
  });
});
