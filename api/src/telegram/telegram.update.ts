// src/telegram/telegram.update.ts
import { Ctx, On, Update } from 'nestjs-telegraf';
import { ExtractionService } from '../extraction/extraction.service';
import { ConversationService } from '../ai/conversation.service';
import { ProductService } from '../products/product.service';

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

    // Save history
    const history = this.userHistories.get(userId) || [];
    history.push({ role: 'user', content: text });

    // Step 1: extract structured info from user text
    const res = await this.extraction.extract(text);

    // Step 2: find matching products
    let foundProducts: any[] = [];

    // from ExtractionService items
    if (res.items && res.items.length) {
      for (const item of res.items) {
        const matches = this.productService.findByName(item.name);
        if (matches.length) {
          foundProducts.push(...matches);
        }
      }
    }

    // fallback: direct scan of the whole text
    if (!foundProducts.length) {
      foundProducts = this.productService.searchInText(text);
    }

    // Step 3: build product context for AI
    let productContext = '';
    if (foundProducts.length) {
      productContext =
        'Product info:\n' +
        foundProducts
          .map(
            (p) =>
              `${p.name} — ${p.price}₸ (SKU: ${p.sku})${
                p.stock ? ` — stock: ${p.stock}` : ''
              }`
          )
          .join('\n');
    }

    // Step 4: get AI reply
    const aiReply = await this.conversation.reply(
      [
        ...history,
        productContext ? { role: 'system', content: productContext } : null
      ].filter(Boolean) as any
    );

    // Step 5: send and save reply
    await ctx.reply(aiReply);
    history.push({ role: 'assistant', content: aiReply });
    this.userHistories.set(userId, history);
  }
}
