import { Global, Module } from '@nestjs/common';
import { EVENT_PUBLISHER } from '../../domain/ports/event-publisher.port.ts';
import { NoopEventPublisher } from './noop-event-publisher.ts';

/**
 * Temporary binding for EVENT_PUBLISHER until Task 13 introduces KafkaModule.
 * Global for the same reason MongoModule and AuthModule are: the use case that
 * consumes the port is declared in HttpModule. Delete this module — and its
 * AppModule import — when KafkaModule lands.
 */
@Global()
@Module({
  providers: [{ provide: EVENT_PUBLISHER, useClass: NoopEventPublisher }],
  exports: [EVENT_PUBLISHER],
})
export class EventsModule {}
