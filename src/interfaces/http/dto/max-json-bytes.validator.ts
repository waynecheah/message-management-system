import { registerDecorator, type ValidationOptions } from 'class-validator';

export function MaxJsonBytes(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'maxJsonBytes',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must serialize to at most ${max} bytes`, ...options },
      validator: {
        validate: (value: unknown) =>
          value === undefined || Buffer.byteLength(JSON.stringify(value)) <= max,
      },
    });
  };
}
