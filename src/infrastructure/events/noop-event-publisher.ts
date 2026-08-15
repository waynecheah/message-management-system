import { Injectable } from '@nestjs/common';
import type { EventPublisher } from '../../domain/ports/event-publisher.port.ts';

/**
 * Temporary stand-in for EVENT_PUBLISHER until Task 13 binds
 * KafkaEventPublisher. Delete this file and its AppModule registration
 * when Task 13's KafkaModule is wired in.
 */
@Injectable()
export class NoopEventPublisher implements EventPublisher {
  async publish(): Promise<void> {
    // intentionally does nothing — see class doc
  }
}
