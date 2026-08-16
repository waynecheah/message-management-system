import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MessageCreatedConsumer } from '../../infrastructure/kafka/message-created.consumer.ts';
import { Public } from '../../infrastructure/auth/public.decorator.ts';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly indexer: MessageCreatedConsumer) {}

  @Public()
  @Get()
  check(): { status: string; indexer: string } {
    if (!this.indexer.isRunning()) {
      // A halted indexer would otherwise leave the API returning 201s while
      // search silently stops updating — the failure mode we rejected a DLQ for.
      throw new ServiceUnavailableException({
        status: 'degraded', indexer: 'stopped', reason: 'consumer crashed',
      });
    }
    return { status: 'ok', indexer: 'running' };
  }
}
