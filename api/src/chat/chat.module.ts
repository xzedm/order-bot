import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ExtractionModule } from '../extraction/extraction.module';
import { ConversationModule } from '../ai/conversation.module';
import { ProductService } from '../products/product.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [ExtractionModule, ConversationModule],
  controllers: [ChatController],
  providers: [ChatService, ProductService, PrismaService],
})
export class ChatModule {}