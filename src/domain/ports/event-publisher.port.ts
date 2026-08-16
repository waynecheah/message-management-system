import type { MessageCreatedEvent } from '../message-created.event.ts';

export interface EventPublisher {
  publish(event: MessageCreatedEvent): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EventPublisher');
