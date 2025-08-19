import { Injectable } from '@nestjs/common';
import { ExtractionService } from '../extraction/extraction.service';
import { ConversationService } from '../ai/conversation.service';
import { ProductService, Product } from '../products/product.service';

interface ChatResult {
  reply: string;
  orderId?: string;
  products?: Product[];
}

@Injectable()
export class ChatService {
  private userHistories = new Map<string, any[]>();

  constructor(
    private readonly extraction: ExtractionService,
    private readonly conversation: ConversationService,
    private readonly productService: ProductService,
  ) {}

  async processMessage(dto: any): Promise<ChatResult> {
    const { message, sessionId, channel } = dto;

    // Get or create session history
    const history = this.userHistories.get(sessionId) || [];
    history.push({ role: 'user', content: message });

    // Step 1: Extract structured info from user message
    const extracted = await this.extraction.extract(message);
    console.log('[ChatService] Extraction result:', extracted);

    // Step 2: Find products based on extraction
    const productNames: string[] = [];
    if (extracted.intent === 'place_order' && extracted.items?.length) {
      productNames.push(...extracted.items.map(item => item.english_name || item.name));
    } else if (extracted.intent === 'product_inquiry' && extracted.products?.length) {
      productNames.push(...extracted.products.map(prod => prod.english_name || prod.name));
    }

    const foundProducts: Product[] = [];
    for (const name of productNames) {
      const matches = await this.productService.findByName(name);
      foundProducts.push(...matches);
    }

    // Step 3: Build context for AI
    let productContext = '';
    if (foundProducts.length) {
      productContext = 'Product info:\n' + foundProducts
        .map(p => `${p.name} — ${p.price}₸ (SKU: ${p.sku})${p.url ? ` — url: ${p.url}` : ''}`)
        .join('\n');
    }

    // Step 4: Prepare hints for conversation
    const hints: any = {};
    if (extracted.intent === 'place_order' && extracted.items) {
      hints.draftSummary = extracted.items.map(i => `${i.name} x${i.qty}`).join(', ');
    }

    // Step 5: Get AI reply
    const contextMessages = [
      ...history,
      productContext ? { role: 'system', content: productContext } : null,
    ].filter(Boolean);

    const aiReply = await this.conversation.reply(contextMessages as any, hints);

    // Step 6: Save conversation history
    history.push({ role: 'assistant', content: aiReply });
    this.userHistories.set(sessionId, history);

    // Step 7: Save to database (optional, for analytics)
    try {
      await this.saveConversationLog(sessionId, message, aiReply, channel, extracted);
    } catch (error) {
      console.error('[ChatService] Failed to save conversation:', error);
      // Don't fail the request if logging fails
    }

    return {
      reply: aiReply,
      products: foundProducts.length ? foundProducts : undefined,
      // TODO: Add orderId when order creation logic is implemented
    };
  }

  private async saveConversationLog(
    sessionId: string,
    userMessage: string,
    botReply: string,
    channel: string,
    extraction: any
  ) {
    // This assumes you have a conversations or messages table
    // Adjust according to your database schema
    
    // For now, just log to console - implement based on your needs
    console.log('[ChatService] Conversation log:', {
      sessionId,
      userMessage,
      botReply,
      channel,
      extraction,
      timestamp: new Date()
    });
  }
}