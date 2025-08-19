import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ExtractionModule } from '../extraction/extraction.module';
import { ConversationModule } from '../ai/conversation.module';
import { ProductService } from '../products/product.service';

@Module({
  imports: [ExtractionModule, ConversationModule],
  controllers: [ChatController],
  providers: [ChatService, ProductService],
})
export class ChatModule {}