import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramUpdate } from './telegram.update';
import { ExtractionModule } from '../extraction/extraction.module';
import { ConversationModule } from '../ai/conversation.module';

@Module({
  imports: [
    TelegrafModule.forRoot({
      token: process.env.TELEGRAM_BOT_TOKEN as string,
      // Без webhook: используем long polling по умолчанию.
    }),
    ExtractionModule,
    ConversationModule,
  ],
  providers: [TelegramUpdate],
})
export class TelegramModule {}
