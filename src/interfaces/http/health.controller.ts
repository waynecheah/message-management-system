import { Controller, Get } from '@nestjs/common';
import { Public } from '../../infrastructure/auth/public.decorator.ts';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
