import { Module } from '@nestjs/common';
import { TelegramModule } from './telegram/telegram.module';
import { ExtractionModule } from './extraction/extraction.module';
import { ConversationModule } from './ai/conversation.module';
import { ProductService } from './products/product.service';
import { ChatModule } from './chat/chat.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [TelegramModule, ExtractionModule, ConversationModule, ChatModule, ProductsModule, OrdersModule, NotificationsModule],
  providers: [ProductService],
})
export class AppModule {}
