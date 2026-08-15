export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class BlankContentError extends DomainError {
  readonly code = 'BLANK_CONTENT';
  constructor() {
    super('content is blank');
  }
}

export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';
  constructor() {
    super('cursor is not parseable');
  }
}

export class CursorDirectionError extends DomainError {
  readonly code = 'CURSOR_DIRECTION_MISMATCH';
  constructor() {
    super('cursor was issued for the other sort direction');
  }
}

export class MissingIdentityError extends DomainError {
  readonly code = 'MISSING_IDENTITY';
  constructor() {
    super('no tenant identity in context');
  }
}
