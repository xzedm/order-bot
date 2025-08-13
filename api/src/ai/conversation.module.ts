import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { AzureOpenAIModule } from '../extraction/azure-openai.module';

@Module({
  imports: [AzureOpenAIModule],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
