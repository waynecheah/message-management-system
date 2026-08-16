import { createPublicKey } from 'node:crypto';
import { registerDecorator, type ValidationOptions } from 'class-validator';

function isEs256PublicKey(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const key = createPublicKey(value);
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1';
  } catch {
    return false;
  }
}

export function IsEs256PublicKey(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isEs256PublicKey',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a PEM-encoded EC P-256 (ES256) public key`,
        ...options,
      },
      validator: { validate: isEs256PublicKey },
    });
  };
}
