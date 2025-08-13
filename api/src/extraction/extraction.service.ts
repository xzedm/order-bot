import { Injectable } from '@nestjs/common';
import Ajv from 'ajv';
import schema from './schema/order.schema.json';
import { AzureOpenAIClient } from '../extraction/azure-openai.client'; // Update path if needed

export type ExtractResult = {
  intent: 'place_order' | 'check_status' | 'product_inquiry' | 'unknown';
  items?: { sku?: string; name: string; english_name?: string; qty: number }[];
  products?: { name: string; english_name?: string }[];
  customer?: { name?: string; phone?: string };
  confidence: number;
};

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema as any);

@Injectable()
export class ExtractionService {
  constructor(private azure: AzureOpenAIClient) {} // Add injection

  async extract(text: string): Promise<ExtractResult> {
    const prompt = `User message: "${text.replace(/"/g, '\\"')}"

Extract the following as JSON:
- intent: "place_order" (if ordering items), "check_status" (if asking about order status), "product_inquiry" (if asking about product info like price, details), "unknown" (otherwise)
- items: array of objects {name: string, english_name?: string, qty: number} - only for place_order, extract mentioned items and quantities. 'name' is the original mentioned name. If the name uses Cyrillic (Russian), provide 'english_name' as the transliterated Latin/English equivalent (e.g., "лего" -> "lego").
- products: array of objects {name: string, english_name?: string} - only for product_inquiry, extract mentioned product names. 'name' is original. If Cyrillic, provide 'english_name' as transliterated English.
- customer: object {name?: string, phone?: string} - if mentioned
- confidence: number between 0 and 1 indicating certainty

Use product_inquiry for questions like "what is the price of X" or "tell me about Y".
For orders like "I want 2 X", use place_order.
Output only valid JSON matching the schema.`;

    const jsonStr = await this.azure.chat(
      [{ role: 'system', content: prompt }],
      { temperature: 0.1, max_tokens: 300, response_format: { type: 'json_object' } }
    );

    try {
      const res = JSON.parse(jsonStr || '{}') as ExtractResult;
      res.confidence = res.confidence ?? 0.5; // Default if missing
      if (validate(res)) {
        return res;
      }
      return { intent: 'unknown', confidence: 0.0 };
    } catch (e) {
      console.error('[ExtractionService] Parse error:', e);
      return { intent: 'unknown', confidence: 0.0 };
    }
  }
}