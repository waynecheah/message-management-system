import type { MessageView } from '../message-view.ts';

export type SearchQuery = {
  readonly conversationId: string;
  readonly term: string;
  readonly limit: number;
};

export interface MessageSearcher {
  search(query: SearchQuery): Promise<MessageView[]>;
}

export const MESSAGE_SEARCHER = Symbol('MessageSearcher');
