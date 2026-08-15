import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { CreateMessage } from '../../application/create-message.usecase.ts';
import { CreateMessageDto } from './dto/create-message.dto.ts';
import { MessageResponseDto } from './dto/message-response.dto.ts';

@ApiTags('messages')
@Controller('api/messages')
export class MessagesController {
  constructor(private readonly createMessage: CreateMessage) {}

  @Post()
  @ApiCreatedResponse({ type: MessageResponseDto })
  async create(@Body() dto: CreateMessageDto): Promise<MessageResponseDto> {
    // tenantId and senderId come from the verified token via ALS (ADR-0018)
    return this.createMessage.execute({
      conversationId: dto.conversationId,
      content: dto.content,
      metadata: dto.metadata,
    });
  }
}
