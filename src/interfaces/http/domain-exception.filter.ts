import { Catch, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import {
  BlankContentError, CursorDirectionError, DomainError, InvalidCursorError,
} from '../../domain/errors.ts';

const BAD_REQUEST = [BlankContentError, InvalidCursorError, CursorDirectionError];

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const isClientFault = BAD_REQUEST.some((type) => error instanceof type);

    if (isClientFault) {
      response.status(HttpStatus.BAD_REQUEST)
        .json({ statusCode: 400, error: error.code, message: error.message });
      return;
    }

    // MissingIdentityError and anything unmapped: our bug, not the caller's.
    this.logger.error(`unmapped domain error: ${error.code}`, error.stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, message: 'Internal server error' });
  }
}
