import type { SearchQuery, MessageSearcher } from '../domain/ports/message-searcher.port.ts';
import { SearchConversationMessages } from './search-conversation-messages.usecase.ts';

describe('SearchConversationMessages', () => {
  it('passes the term and limit through to the searcher', async () => {
    const seen: SearchQuery[] = [];
    const searcher: MessageSearcher = { search: async (q) => { seen.push(q); return []; } };
    await new SearchConversationMessages(searcher)
      .execute({ conversationId: 'c1', term: 'hello', limit: 20 });
    expect(seen[0]).toEqual({ conversationId: 'c1', term: 'hello', limit: 20 });
  });

  it('returns an empty array when nothing matches', async () => {
    const searcher: MessageSearcher = { search: async () => [] };
    const results = await new SearchConversationMessages(searcher)
      .execute({ conversationId: 'c1', term: 'nothing', limit: 20 });
    expect(results).toEqual([]);
  });
});
