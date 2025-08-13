// Add this new file: src/azure-openai/azure-openai.module.ts
import { Module } from '@nestjs/common';
import { AzureOpenAIClient } from './azure-openai.client';

@Module({
  providers: [AzureOpenAIClient],
  exports: [AzureOpenAIClient],
})
export class AzureOpenAIModule {}