import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Matches, Max, Min, validateSync } from 'class-validator';

export class EnvConfig {
  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  PORT = 3000;

  @IsString() @IsNotEmpty() MONGO_URL!: string;
  @IsString() @IsNotEmpty() MONGO_DB!: string;

  @IsString() @IsNotEmpty() KAFKA_BROKERS!: string;
  @IsString() @IsNotEmpty() KAFKA_TOPIC!: string;
  @Type(() => Number) @IsInt() @Min(1) KAFKA_PARTITIONS = 3;
  @IsString() @IsNotEmpty() KAFKA_GROUP_ID!: string;

  @IsString() @IsNotEmpty() ELASTICSEARCH_NODE!: string;
  @IsString() @IsNotEmpty() ELASTICSEARCH_INDEX!: string;

  @Matches(/-----BEGIN PUBLIC KEY-----/, { message: 'JWT_PUBLIC_KEY must be a PEM public key' })
  JWT_PUBLIC_KEY!: string;
  @IsString() @IsNotEmpty() JWT_ISSUER!: string;
  @IsString() @IsNotEmpty() JWT_AUDIENCE!: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const config = plainToInstance(EnvConfig, raw, { enableImplicitConversion: false });
  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment:\n${errors.map((e) => e.toString()).join('\n')}`);
  }
  return config;
}
