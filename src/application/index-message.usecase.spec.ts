import type { MessageCreatedEvent } from '../domain/message-created.event.ts';
import { IndexMessage } from './index-message.usecase.ts';

const event: MessageCreatedEvent = {
  id: '01996a1e-0000-7000-8000-000000000000',
  tenantId: 'tenant-a', conversationId: 'c1', senderId: 's1',
  content: 'indexed', timestamp: '2026-08-15T10:00:00.000Z',
};

describe('IndexMessage', () => {
  it('hands the event to the indexer unchanged', async () => {
    const seen: MessageCreatedEvent[] = [];
    await new IndexMessage({ index: async (e) => { seen.push(e); } }).execute(event);
    expect(seen).toEqual([event]);
  });

  it('propagates an indexing failure so the offset is not committed', async () => {
    const indexer = { index: async () => { throw new Error('es down'); } };
    await expect(new IndexMessage(indexer).execute(event)).rejects.toThrow('es down');
  });
});
