import type { Cursor, SortDirection } from '../cursor.ts';
import type { MessageView } from '../message-view.ts';
import type { Page } from '../page.ts';

export type ListQuery = {
  readonly conversationId: string;
  readonly limit: number;
  readonly direction: SortDirection;
  readonly cursor: Cursor | null;
};

export interface MessageReader {
  listByConversation(query: ListQuery): Promise<Page<MessageView>>;
}

export const MESSAGE_READER = Symbol('MessageReader');
