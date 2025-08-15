import { Ctx, On, Update } from 'nestjs-telegraf';
import { ExtractionService } from '../extraction/extraction.service';
import { ConversationService } from '../ai/conversation.service';
import { ProductService, Product } from '../products/product.service';

@Update()
export class TelegramUpdate {
  private userHistories = new Map<number, { messages: any[], lastProducts: Product[] }>();

  constructor(
    private readonly extraction: ExtractionService,
    private readonly conversation: ConversationService,
    private readonly productService: ProductService
  ) {}

  @On('text')
  async onText(@Ctx() ctx: any) {
    const text = ctx.message?.text as string;
    const userId = ctx.from.id;

    // Load or initialize user history
    const userData = this.userHistories.get(userId) || { messages: [], lastProducts: [] };
    const history = userData.messages;
    history.push({ role: 'user', content: text });

    // Step 1: Extract structured info from user text
    const res = await this.extraction.extract(text);

    // Step 2: Determine product names to search
    let productNames: string[] = [];
    if (res.intent === 'place_order' && res.items?.length) {
      productNames = res.items.map(item => item.english_name || item.name);
    } else if (res.intent === 'product_inquiry' && res.products?.length) {
      productNames = res.products.map(prod => prod.english_name || prod.name);
    } else if (!productNames.length && userData.lastProducts.length) {
      // Fallback to last mentioned products for follow-up questions
      productNames = userData.lastProducts.map(p => p.name);
    }

    // Step 3: Find matching products from Supabase
    let foundProducts: Product[] = userData.lastProducts; // Reuse last products if applicable
    if (productNames.length && !foundProducts.length) {
      for (const name of productNames) {
        const matches = await this.productService.findByName(name);
        if (matches.length) {
          foundProducts.push(...matches);
        }
      }
    }

    // Log for debugging
    console.log('Extracted:', res);
    console.log('Found Products:', foundProducts);

    // Step 4: Build product context
    let productContext = '';
    if (foundProducts.length) {
      productContext =
        'Available products in inventory:\n' +
        foundProducts
          .map(
            (p) =>
              `${p.name} — ${p.price}₸ — Qty: ${p.qty ?? 'Unknown'} (SKU: ${p.sku})` +
              (p.url ? ` — url: ${p.url}` : '')
          )
          .join('\n') +
        '\nIf a product is not listed, it is not available. Maintain consistency with prior responses.';
    } else {
      productContext =
        'No matching products found. Politely inform the user the product is unavailable and suggest alternatives if possible.';
    }

    // Step 5: Build hints
    let hints: any = {};
    if (res.intent === 'place_order' && res.items?.length) {
      const item = res.items[0];
      const product = foundProducts.find(p => p.name.includes(item.name));
      if (product && product.qty >= item.qty) {
        hints.draftSummary = `${item.name} x${item.qty}`;
        hints.totalPrice = product.price * item.qty;
        hints.availableQty = product.qty;
      } else {
        hints.error = `Requested quantity (${item.qty}) exceeds available stock (${product?.qty || 0}).`;
      }
    }

    // Step 6: Get AI reply with context
    const systemPrompt = `You are a helpful sales bot. Maintain consistency with prior responses. If you previously said a product is available, do not say it is unavailable unless explicitly corrected. Use the provided product context and conversation history.`;
    const aiReply = await this.conversation.reply(
      [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'system', content: productContext },
      ].filter(Boolean) as any,
      hints
    );

    // Step 7: Send reply and update history
    await ctx.reply(aiReply);
    history.push({ role: 'assistant', content: aiReply });
    this.userHistories.set(userId, { messages: history, lastProducts: foundProducts });
  }
}