import { Module } from '@nestjs/common';
import { CreateMessage } from '../../application/create-message.usecase.ts';
import { ListConversationMessages } from '../../application/list-conversation-messages.usecase.ts';
import { SearchConversationMessages } from '../../application/search-conversation-messages.usecase.ts';
import { ConversationMessagesController } from './conversation-messages.controller.ts';
import { HealthController } from './health.controller.ts';
import { MessagesController } from './messages.controller.ts';

@Module({
  controllers: [HealthController, MessagesController, ConversationMessagesController],
  providers: [CreateMessage, ListConversationMessages, SearchConversationMessages],
})
export class HttpModule {}
