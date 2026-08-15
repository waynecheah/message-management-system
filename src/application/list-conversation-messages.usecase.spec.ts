import { CursorDirectionError } from '../domain/errors.ts';
import { encodeCursor } from '../domain/cursor.ts';
import type { ListQuery, MessageReader } from '../domain/ports/message-reader.port.ts';
import { ListConversationMessages } from './list-conversation-messages.usecase.ts';

const emptyPage = { items: [], nextCursor: null };

describe('ListConversationMessages', () => {
  it('passes a decoded cursor to the reader', async () => {
    const seen: ListQuery[] = [];
    const reader: MessageReader = {
      listByConversation: async (q) => { seen.push(q); return emptyPage; },
    };
    const raw = encodeCursor({
      timestamp: new Date('2026-08-15T10:00:00.000Z'),
      id: '01996a1e-0000-7000-8000-000000000000',
      direction: 'desc',
    });
    await new ListConversationMessages(reader).execute({
      conversationId: 'c1', limit: 20, sort: 'desc', cursor: raw,
    });
    expect(seen[0]?.cursor?.id).toBe('01996a1e-0000-7000-8000-000000000000');
  });

  it('passes a null cursor for the first page', async () => {
    const seen: ListQuery[] = [];
    const reader: MessageReader = {
      listByConversation: async (q) => { seen.push(q); return emptyPage; },
    };
    await new ListConversationMessages(reader).execute({
      conversationId: 'c1', limit: 20, sort: 'desc', cursor: undefined,
    });
    expect(seen[0]?.cursor).toBeNull();
  });

  it('rejects a cursor issued for the other direction', async () => {
    const reader: MessageReader = { listByConversation: async () => emptyPage };
    const raw = encodeCursor({
      timestamp: new Date(), id: '01996a1e-0000-7000-8000-000000000000', direction: 'desc',
    });
    await expect(
      new ListConversationMessages(reader).execute({
        conversationId: 'c1', limit: 20, sort: 'asc', cursor: raw,
      }),
    ).rejects.toThrow(CursorDirectionError);
  });
});
