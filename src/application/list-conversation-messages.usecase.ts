import { Inject, Injectable } from '@nestjs/common';
import { decodeCursor, type SortDirection } from '../domain/cursor.ts';
import type { MessageView } from '../domain/message-view.ts';
import type { Page } from '../domain/page.ts';
import { MESSAGE_READER, type MessageReader } from '../domain/ports/message-reader.port.ts';

export type ListInput = {
  conversationId: string;
  limit: number;
  sort: SortDirection;
  cursor: string | undefined;
};

@Injectable()
export class ListConversationMessages {
  constructor(@Inject(MESSAGE_READER) private readonly reader: MessageReader) {}

  async execute(input: ListInput): Promise<Page<MessageView>> {
    return this.reader.listByConversation({
      conversationId: input.conversationId,
      limit: input.limit,
      direction: input.sort,
      cursor: input.cursor ? decodeCursor(input.cursor, input.sort) : null,
    });
  }
}
