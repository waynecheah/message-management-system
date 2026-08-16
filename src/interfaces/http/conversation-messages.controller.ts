import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ListConversationMessages } from '../../application/list-conversation-messages.usecase.ts';
import { SearchConversationMessages } from '../../application/search-conversation-messages.usecase.ts';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto.ts';
import { MessageResponseDto } from './dto/message-response.dto.ts';
import { PageResponseDto } from './dto/page-response.dto.ts';
import { SearchMessagesQueryDto } from './dto/search-messages.query.dto.ts';

@ApiTags('conversations')
@Controller('api/conversations/:conversationId/messages')
export class ConversationMessagesController {
  constructor(
    private readonly listMessages: ListConversationMessages,
    private readonly searchMessages: SearchConversationMessages,
  ) {}

  @Get()
  @ApiOkResponse({ type: PageResponseDto })
  async list(
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<PageResponseDto> {
    const page = await this.listMessages.execute({
      conversationId,
      limit: query.limit,
      sort: query.sort,
      cursor: query.cursor,
    });
    return { items: [...page.items], nextCursor: page.nextCursor };
  }

  @Get('search')
  @ApiOkResponse({ schema: { properties: { items: { type: 'array' } } } })
  async search(
    @Param('conversationId') conversationId: string,
    @Query() query: SearchMessagesQueryDto,
  ): Promise<{ items: MessageResponseDto[] }> {
    const items = await this.searchMessages.execute({
      conversationId, term: query.q, limit: query.limit,
    });
    return { items: [...items] };
  }
}
