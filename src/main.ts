import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { AppModule } from './app.module.ts';
import { EnvConfig } from './infrastructure/config/env.config.ts';
import { DomainExceptionFilter } from './interfaces/http/domain-exception.filter.ts';
import { SanitizeContentPipe } from './interfaces/http/sanitize-content.pipe.ts';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configure(app);
  app.enableShutdownHooks();
  await app.listen(app.get(EnvConfig).PORT);
}

export function configure(app: Parameters<typeof SwaggerModule.setup>[1]): void {
  app.use(express.json({ limit: '256kb' }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    new SanitizeContentPipe(), // after validation, deliberately
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  const docs = new DocumentBuilder().setTitle('Message Management').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, docs));
}

if (process.argv[1]?.endsWith('main.ts')) {
  void bootstrap();
}
