import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'body-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(json({ limit: '1mb' }));

  const config = new DocumentBuilder()
    .setTitle('OrderBot API')
    .setVersion('0.1.0')
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc);

  const port = process.env.PORT || 8080;
  await app.listen(port);
  // Long polling для Telegram стартует автоматически через nestjs-telegraf
  // (webhook не нужен на этом шаге).
  // Открой /api/docs для проверки API.
}
bootstrap();
