import { NotificationsModule } from './../notifications/notifications.module';
import { OrdersModule } from './../orders/orders.module';
import { ProductsModule } from './../products/products.module';
import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramUpdate } from './telegram.update';
import { ExtractionModule } from '../extraction/extraction.module';
import { ConversationModule } from '../ai/conversation.module';
import { ProductService } from '../products/product.service';

@Module({
  imports: [
    TelegrafModule.forRoot({
      token: process.env.TELEGRAM_BOT_TOKEN as string,
      // Без webhook: используем long polling по умолчанию.
    }),
    ExtractionModule,
    ConversationModule,
    ProductsModule,
    OrdersModule,
    NotificationsModule
  ],
  providers: [TelegramUpdate, ProductService],
})
export class TelegramModule {}
