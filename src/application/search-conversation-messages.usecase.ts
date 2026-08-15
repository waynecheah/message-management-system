import { Inject, Injectable } from '@nestjs/common';
import type { MessageView } from '../domain/message-view.ts';
import {
  MESSAGE_SEARCHER, type MessageSearcher, type SearchQuery,
} from '../domain/ports/message-searcher.port.ts';

@Injectable()
export class SearchConversationMessages {
  constructor(@Inject(MESSAGE_SEARCHER) private readonly searcher: MessageSearcher) {}

  async execute(query: SearchQuery): Promise<MessageView[]> {
    return this.searcher.search(query);
  }
}
