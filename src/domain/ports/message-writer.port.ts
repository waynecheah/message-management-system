import type { Message } from '../message.ts';

export interface MessageWriter {
  save(message: Message): Promise<void>;
}

export const MESSAGE_WRITER = Symbol('MessageWriter');
