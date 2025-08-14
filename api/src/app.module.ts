import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { TelegramModule } from './telegram/telegram.module';
import { ExtractionModule } from './extraction/extraction.module';
import { ConversationModule } from './ai/conversation.module';
import { ProductService } from './products/product.service';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [TelegramModule, ExtractionModule, ConversationModule, ChatModule],
  providers: [PrismaService, ProductService],
})
export class AppModule {}
