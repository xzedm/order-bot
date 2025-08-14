import { Ctx, On, Update } from 'nestjs-telegraf';
import { ExtractionService } from '../extraction/extraction.service';
import { ConversationService } from '../ai/conversation.service';
import { ProductService, Product } from '../products/product.service';

@Update()
export class TelegramUpdate {
  private userHistories = new Map<number, any[]>();

  constructor(
    private readonly extraction: ExtractionService,
    private readonly conversation: ConversationService,
    private readonly productService: ProductService
  ) {}

  @On('text')
  async onText(@Ctx() ctx: any) {
    const text = ctx.message?.text as string;
    const userId = ctx.from.id;

    // Save chat history
    const history = this.userHistories.get(userId) || [];
    history.push({ role: 'user', content: text });

    // Step 1: Extract structured info from user text using LLM
    const res = await this.extraction.extract(text);

    // Step 2: Determine product names to search based on intent
    let productNames: string[] = [];
    if (res.intent === 'place_order' && res.items?.length) {
      productNames = res.items.map(item => item.english_name || item.name);
    } else if (res.intent === 'product_inquiry' && res.products?.length) {
      productNames = res.products.map(prod => prod.english_name || prod.name);
    }

    // Step 3: Find matching products from Supabase
    const foundProducts: Product[] = [];
    for (const name of productNames) {
      const matches = await this.productService.findByName(name);
      if (matches.length) {
        foundProducts.push(...matches);
      }
    }

    // Step 4: Build product context for AI (only real DB products)
    let productContext = '';

    if (foundProducts.length) {
      productContext =
        'Here are the ONLY available products in our inventory:\n' +
        foundProducts
          .map(
            (p) =>
              `${p.name} — ${p.price}₸ (SKU: ${p.sku})${p.url ? ` — url: ${p.url}` : ''}`
          )
          .join('\n') +
        '\nIf a product is not listed above, tell the user it is not available.';
    } else {
      productContext =
        'No matching products were found in the database. Politely tell the user that we do not have this product.';
    }


    // Optional: Build hints based on extraction (expand as needed)
    let hints: any = {};
    if (res.intent === 'place_order' && res.items) {
      hints.draftSummary = res.items.map(i => `${i.name} x${i.qty}`).join(', ');
    }
    // Add more logic for missing fields, locale, etc., if needed

    // Step 5: Get AI reply with context
    const aiReply = await this.conversation.reply(
      [
        ...history,
        productContext ? { role: 'system', content: productContext } : null,
      ].filter(Boolean) as any,
      hints // Pass hints
    );

    // Step 6: Send reply and store in history
    await ctx.reply(aiReply);
    history.push({ role: 'assistant', content: aiReply });
    this.userHistories.set(userId, history);
  }
}