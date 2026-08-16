import { registerDecorator, type ValidationOptions } from 'class-validator';

export function IsNotBlank(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isNotBlank',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must not be blank`, ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
      },
    });
  };
}
