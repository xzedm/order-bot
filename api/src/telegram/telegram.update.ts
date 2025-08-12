import { Ctx, Help, Hears, On, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { ExtractionService } from '../extraction/extraction.service';
import { ConversationService } from '../ai/conversation.service';

@Update()
export class TelegramUpdate {
  // Store user chat histories in memory (for demo — later use Redis/DB)
  private userHistories = new Map<number, { role: 'user' | 'assistant', content: string }[]>();

  constructor(
    private readonly extraction: ExtractionService,
    private readonly conversation: ConversationService
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    if (!ctx.from) {
      return ctx.reply('Error: Could not identify user');
    }
    this.userHistories.set(ctx.from.id, []);
    await ctx.reply(
      'Привет! Я помогу оформить заказ.\n' +
      'Напишите, что нужно (например: "3 Arduino Uno и 2 Raspberry Pi 4").\n' +
      '/status <номер> — проверить статус заказа.\n' +
      '/help — помощь.'
    );
  }

  @Help()
  async onHelp(@Ctx() ctx: Context) {
    await ctx.reply('/start — приветствие\n/order — опишите заказ свободным текстом\n/status <номер> — статус заказа');
  }

  @Hears(/^\/status\s+(.+)/i)
  async status(@Ctx() ctx: any) {
    const num = (ctx.match?.[1] || '').trim();
    await ctx.reply(`Статус заказа ${num}: New (демо)`);
  }

  @On('text')
  async onText(@Ctx() ctx: any) {
    const text = ctx.message?.text as string;
    const res = await this.extraction.extract(text);

    // Save user message to history
    const history = this.userHistories.get(ctx.from.id) || [];
    history.push({ role: 'user', content: text });

    if (res.intent === 'place_order' && res.items?.length) {
      // Format items into a readable string
      const itemsText = res.items.map(item => `${item.qty} x ${item.name}`).join('\n');
      history.push({ role: 'assistant', content: `Черновик заказа:\n${itemsText}\nПодтвердить? (да/изменить)` });
      this.userHistories.set(ctx.from.id, history);
      return ctx.reply(`Черновик заказа:\n${itemsText}\nПодтвердить? (да/изменить)`);
    }

    if (res.intent === 'check_status') {
      history.push({ role: 'assistant', content: 'Введите: /status <номер заказа>' });
      this.userHistories.set(ctx.from.id, history);
      return ctx.reply('Введите: /status <номер заказа>');
    }

    const aiReply = await this.conversation.reply(history);
    console.log('AI Reply:', aiReply, 'Type:', typeof aiReply);
    const safeReply = typeof aiReply === 'string' ? aiReply : JSON.stringify(aiReply, null, 2);
    console.log('Safe Reply:', safeReply, 'Type:', typeof safeReply);
    console.log('Before ctx.reply - Value:', safeReply, 'Type:', typeof safeReply);
    await ctx.reply(safeReply); // Ensure await is explicit
    console.log('After ctx.reply - Result:', ctx.message, 'Type:', typeof ctx.message); // Log the context message
    history.push({ role: 'assistant', content: safeReply });
    this.userHistories.set(ctx.from.id, history);

    return; // No need to return the result unless needed
  }
}