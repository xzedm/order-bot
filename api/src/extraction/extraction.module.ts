// Update: src/extraction/extraction.module.ts
import { Module } from '@nestjs/common';
import { ExtractionService } from './extraction.service';
import { AzureOpenAIModule } from './azure-openai.module'; // Add this import

@Module({
  imports: [AzureOpenAIModule], // Add this
  providers: [ExtractionService],
  exports: [ExtractionService],
})
export class ExtractionModule {}