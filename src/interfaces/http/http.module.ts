import { Module } from '@nestjs/common';
import { CreateMessage } from '../../application/create-message.usecase.ts';
import { HealthController } from './health.controller.ts';
import { MessagesController } from './messages.controller.ts';

@Module({
  controllers: [HealthController, MessagesController],
  providers: [CreateMessage],
})
export class HttpModule {}
