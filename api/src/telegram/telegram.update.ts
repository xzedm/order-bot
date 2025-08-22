// api/src/telegram/telegram.update.ts
import { Ctx, On, Update, Start, Command, Action } from 'nestjs-telegraf';
import { ExtractionService } from '../extraction/extraction.service';
import { ConversationService } from '../ai/conversation.service';
import { ProductService, Product } from '../products/product.service';
import { OrderService } from '../orders/order.service';
import { ManagerNotificationService } from '../notifications/manager-notification.service';

interface UserSession {
  messages: any[];
  lastProducts: Product[];
  pendingOrder?: {
    items: Array<{ name: string; sku?: string; qty: number; price: number }>; // Added price
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    step: 'collecting_info' | 'confirming' | 'ready';
    originalMessage?: string;
  };
  locale: 'ru' | 'en';
  collectedCustomerPhone?: string;
  collectedCustomerName?: string;
}

@Update()
export class TelegramUpdate {
  private userSessions = new Map<number, UserSession>();

  constructor(
    private readonly extraction: ExtractionService,
    private readonly conversation: ConversationService,
    private readonly productService: ProductService,
    private readonly orderService: OrderService,
    private readonly managerNotification: ManagerNotificationService
  ) {}

  @Start()
  async start(@Ctx() ctx: any) {
    const userId = ctx.from.id;
    const userLang = ctx.from.language_code;
    const locale = userLang === 'en' ? 'en' : 'ru';

    // Initialize user session
    this.userSessions.set(userId, {
      messages: [],
      lastProducts: [],
      locale: locale
    });

    const welcomeMessage = locale === 'en' 
      ? `👋 Welcome to Kerneu Group!\n\nI can help you place orders for electronics and components. Just tell me what you need!\n\nExamples:\n• "I need 2 Arduino Uno"\n• "Show me Raspberry Pi prices"\n• "Check order status KG-2025-000123"\n\nType /help for more commands.`
      : `👋 Добро пожаловать в Kerneu Group!\n\nЯ помогу вам оформить заказы на электронику и компоненты. Просто скажите, что вам нужно!\n\nПримеры:\n• "Мне нужно 2 Arduino Uno"\n• "Покажи цены на Raspberry Pi"\n• "Проверь статус заказа KG-2025-000123"\n\nНапишите /help для списка команд.`;

    await ctx.reply(welcomeMessage);
  }

  @Command('help')
  async help(@Ctx() ctx: any) {
    const userId = ctx.from.id;
    const session = this.userSessions.get(userId);
    const locale = session?.locale || 'ru';

    const helpMessage = locale === 'en'
      ? `🤖 <b>Available Commands:</b>\n\n/start - Start conversation\n/help - Show this help\n/status - Check order status\n/cancel - Cancel current operation\n/lang - Change language\n\n<b>How to order:</b>\n1. Tell me what products you need\n2. Provide your contact details\n3. Confirm the order\n\n<b>Examples:</b>\n• "I want 3 Arduino Uno and 2 Raspberry Pi"\n• "What's the price of ESP32?"\n• "Check order KG-2025-000123"`
      : `🤖 <b>Доступные команды:</b>\n\n/start - Начать диалог\n/help - Показать эту справку\n/status - Проверить статус заказа\n/cancel - Отменить текущую операцию\n/lang - Сменить язык\n\n<b>Как оформить заказ:</b>\n1. Скажите какие товары нужны\n2. Укажите контактные данные\n3. Подтвердите заказ\n\n<b>Примеры:</b>\n• "Хочу 3 Arduino Uno и 2 Raspberry Pi"\n• "Какая цена ESP32?"\n• "Проверь заказ KG-2025-000123"`;

    await ctx.reply(helpMessage, { parse_mode: 'HTML' });
  }

  @Command('status')
  async checkStatus(@Ctx() ctx: any) {
    const text = ctx.message.text.replace('/status', '').trim();
    const userId = ctx.from.id;
    const session = this.userSessions.get(userId);
    const locale = session?.locale || 'ru';

    if (text) {
      // Order number provided
      await this.handleOrderStatusCheck(ctx, text);
    } else {
      // Ask for order number
      const message = locale === 'en'
        ? 'Please provide the order number (format: KG-YYYY-XXXXXX):'
        : 'Пожалуйста, укажите номер заказа (формат: KG-YYYY-XXXXXX):';
      await ctx.reply(message);
    }
  }

  @Command('cancel')
  async cancel(@Ctx() ctx: any) {
    const userId = ctx.from.id;
    const session = this.userSessions.get(userId);
    
    if (session) {
      session.pendingOrder = undefined;
      this.userSessions.set(userId, session);
    }

    const locale = session?.locale || 'ru';
    const message = locale === 'en' 
      ? '❌ Operation cancelled. How can I help you?'
      : '❌ Операция отменена. Чем могу помочь?';
    
    await ctx.reply(message);
  }

  @Command('lang')
  async changeLanguage(@Ctx() ctx: any) {
    const userId = ctx.from.id;
    const session = this.userSessions.get(userId) || { messages: [], lastProducts: [], locale: 'ru' };
    
    // Toggle language
    session.locale = session.locale === 'ru' ? 'en' : 'ru';
    this.userSessions.set(userId, session);

    const message = session.locale === 'en'
      ? '🌍 Language changed to English'
      : '🌍 Язык изменен на русский';

    await ctx.reply(message);
  }

  // Handle manager callback actions (order confirmations, rejections, etc.)
  @Action(/^(confirm_order|reject_order|contact_customer|edit_order):(.+)$/)
  async handleManagerAction(@Ctx() ctx: any) {
    await this.managerNotification.handleManagerAction(ctx.callbackQuery);
    await ctx.answerCbQuery();
  }

  @On('text')
  async onText(@Ctx() ctx: any) {
    const text = ctx.message?.text as string;
    const userId = ctx.from.id;

    // Initialize session if not exists
    let session = this.userSessions.get(userId);
    if (!session) {
      session = { messages: [], lastProducts: [], locale: 'ru' };
      this.userSessions.set(userId, session);
    }

    // Opportunistically collect contact info even before order starts
    this.tryCollectContactInfo(session, text);

    // If waiting for confirmation, handle Yes/No here
    if (session.pendingOrder && session.pendingOrder.step === 'ready') {
      await this.handleOrderConfirmation(
        ctx,
        session,
        text,
        session.pendingOrder.originalMessage || text
      );
      return;
    }

    // Check if it's an order status query
    if (this.isOrderNumberQuery(text)) {
      await this.handleOrderStatusCheck(ctx, text);
      return;
    }

    // Add user message to history
    session.messages.push({ role: 'user', content: text });

    try {
      // Step 1: Extract structured info from user text
      const extracted = await this.extraction.extract(text);
      console.log('🔍 Extraction result:', extracted);

      // Step 2: Fast-path: if user typed what looks like a product code/prefix (e.g., REV-41), treat as quick order intent
      if ((extracted.intent === 'product_inquiry' || extracted.intent === 'unknown') && this.isLikelyProductCodeOrSku(text)) {
        const quickExtract = { intent: 'place_order', items: [{ name: text, qty: 1 }] } as any;
        await this.handleOrderIntent(ctx, session, quickExtract, text);
        return;
      }

      // Step 3: Handle different intents
      if (extracted.intent === 'place_order' && extracted.items?.length) {
        await this.handleOrderIntent(ctx, session, extracted, text);
      } else if (extracted.intent === 'product_inquiry') {
        await this.handleProductInquiry(ctx, session, extracted, text);
      } else if (extracted.intent === 'check_status') {
        // Try to extract order number from text
        const orderNumberMatch = text.match(/KG-\d{4}-\d{6}/i);
        if (orderNumberMatch) {
          await this.handleOrderStatusCheck(ctx, orderNumberMatch[0]);
        } else {
          const message = session.locale === 'en'
            ? 'Please provide the order number in format KG-YYYY-XXXXXX'
            : 'Пожалуйста, укажите номер заказа в формате KG-YYYY-XXXXXX';
          await ctx.reply(message);
        }
      } else {
        // Handle as general conversation or collect missing order info
        await this.handleGeneralMessage(ctx, session, extracted, text);
      }

    } catch (error) {
      console.error('❌ Error processing message:', error);
      
      const errorMessage = session.locale === 'en'
        ? 'Sorry, I encountered an error. Please try again or contact our support.'
        : 'Извините, произошла ошибка. Попробуйте еще раз или обратитесь в поддержку.';
      
      await ctx.reply(errorMessage);
    }
  }

  private async handleOrderIntent(ctx: any, session: UserSession, extracted: any, originalText: string) {
    const userId = ctx.from.id;

    // Log extraction result for debugging
    console.log('🔍 Extracted items for order:', extracted.items);

    // Try to match extracted items with lastProducts first
    const foundProducts: Product[] = [];
    let ambiguousSets: Product[][] = [];
    for (const item of extracted.items) {
      const productName = item.english_name || item.name;
      // Check for explicit SKU and/or quantity in the free-text
      const explicitSku = this.extractSkuFromText(productName);
      const explicitQty = this.extractQtyFromText(originalText) || item.qty;
      // First, check session.lastProducts for a match
      let product = session.lastProducts.find(p =>
        p.name.toLowerCase().includes(productName.toLowerCase()) ||
        (item.sku && p.sku === item.sku)
      );

      // If no match in lastProducts, search the database
      if (!product) {
        if (explicitSku) {
          const bySku = await this.productService.findBySku(explicitSku);
          if (bySku) {
            product = bySku;
          }
        }
        const matches = product ? [] : await this.productService.findByName(productName);
        if (matches.length > 1 && this.isLikelyProductCodeOrSku(productName)) {
          // Ambiguous code prefix like REV-41 -> ask user to choose specific SKU(s)
          ambiguousSets.push(matches);
          continue;
        }
        if (matches.length > 0) {
          product = matches[0]; // Take the first match
        }
      }

      if (product) {
        // Attach the resolved quantity if we parsed it
        (product as any).__resolvedQty = explicitQty || item.qty || 1;
        foundProducts.push(product);
      } else {
        console.log(`⚠️ Product not found for: ${productName}`);
      }
    }

    // Initialize or update pending order
    if (!session.pendingOrder) {
      session.pendingOrder = {
        items: foundProducts.map(product => {
          const requestedItem = extracted.items.find(
            (item: any) =>
              product.name.toLowerCase().includes((item.english_name || item.name).toLowerCase()) ||
              (item.sku && product.sku === item.sku)
          );
          return {
            name: product.name,
            sku: product.sku,
            qty: (product as any).__resolvedQty || requestedItem?.qty || 1, // Default to 1 if quantity not specified
            price: Number(product.price)
          };
        }),
        step: 'collecting_info'
      };
    } else {
      // Add new items to existing order
      session.pendingOrder.items.push(
        ...foundProducts.map(product => {
          const requestedItem = extracted.items.find(
            (item: any) =>
              product.name.toLowerCase().includes((item.english_name || item.name).toLowerCase()) ||
              (item.sku && product.sku === item.sku)
          );
          return {
            name: product.name,
            sku: product.sku,
            qty: (product as any).__resolvedQty || requestedItem?.qty || 1,
            price: Number(product.price)
          };
        })
      );
    }

    session.lastProducts = foundProducts;
    this.userSessions.set(userId, session);

    if (foundProducts.length === 0 && ambiguousSets.length === 0) {
      const message = session.locale === 'en'
        ? 'Sorry, I couldn\'t find any matching products. Could you please specify the exact product names or SKUs?'
        : 'Извините, я не смог найти подходящие товары. Можете уточнить точные названия или артикулы?';
      await ctx.reply(message);
      return;
    }

    // If there are ambiguous sets, show options and ask the user to specify SKUs and quantities
    if (ambiguousSets.length > 0) {
      const flat = Array.from(new Map(ambiguousSets.flat().map(p => [p.sku, p])).values());
      await this.showProductInfo(ctx, session, flat);
      const ask = session.locale === 'en'
        ? 'Please specify which SKU(s) you want and quantities (e.g., "REV-41-1303 x2, REV-41-1304 x1").'
        : 'Пожалуйста, укажите какие именно артикула и количество (например, "REV-41-1303 x2, REV-41-1304 x1").';
      await ctx.reply(ask);
      return;
    }

    // Show found products and ask for confirmation
    await this.showProductsAndCollectInfo(ctx, session, foundProducts, extracted.items, originalText);
  }

  private async handleProductInquiry(ctx: any, session: UserSession, extracted: any, originalText: string) {
    let productNames: string[] = [];
    
    if (extracted.products?.length) {
      productNames = extracted.products.map(p => p.english_name || p.name);
    } else {
      // Fallback to last mentioned products
      productNames = session.lastProducts.map(p => p.name);
    }

    const foundProducts: Product[] = [];
    for (const name of productNames) {
      const explicitSku = this.extractSkuFromText(name) || this.extractSkuFromText(originalText);
      if (explicitSku) {
        const bySku = await this.productService.findBySku(explicitSku);
        if (bySku) {
          foundProducts.push(bySku);
          continue;
        }
      }
      const matches = await this.productService.findByName(name);
      foundProducts.push(...matches);
    }

    session.lastProducts = foundProducts;
    this.userSessions.set(ctx.from.id, session);

    if (foundProducts.length === 0) {
      const message = session.locale === 'en'
        ? 'Sorry, I couldn\'t find information about those products. Could you please specify the exact product names?'
        : 'Извините, я не смог найти информацию о этих товарах. Можете уточнить точные названия?';
      await ctx.reply(message);
      return;
    }

    // Show product information
    await this.showProductInfo(ctx, session, foundProducts);
  }

  private async handleGeneralMessage(ctx: any, session: UserSession, extracted: any, originalText: string) {
    const userId = ctx.from.id;

    // If user has a pending order, try to collect missing information
    if (session.pendingOrder && session.pendingOrder.step === 'collecting_info') {
      await this.collectOrderInformation(ctx, session, originalText);
      return;
    }

    // Otherwise, handle as general conversation
    const productContext = this.buildProductContext(session.lastProducts);
    
    const contextMessages = [
      ...session.messages,
      productContext ? { role: 'system', content: productContext } : null,
    ].filter(Boolean);

    const aiReply = await this.conversation.reply(
      contextMessages as any,
      { locale: session.locale }
    );

    await ctx.reply(aiReply);
    session.messages.push({ role: 'assistant', content: aiReply });
    this.userSessions.set(userId, session);
  }

  private async showProductsAndCollectInfo(
    ctx: any, 
    session: UserSession, 
    products: Product[], 
    requestedItems: any[], 
    originalText: string
  ) {
    const locale = session.locale;
    
    // Show products found
    let message = locale === 'en' 
      ? '🛒 <b>Products found:</b>\n\n'
      : '🛒 <b>Найденные товары:</b>\n\n';

    let totalAmount = 0;
    const validItems: Array<{ name: string; sku: string; qty: number; price: number }> = [];

    for (const item of requestedItems) {
      const product = products.find(p => 
        p.name.toLowerCase().includes(item.name.toLowerCase()) ||
        (item.english_name && p.name.toLowerCase().includes(item.english_name.toLowerCase()))
      );

      if (product) {
        const itemTotal = Number(product.price) * item.qty;
        totalAmount += itemTotal;
        validItems.push({
          name: product.name,
          sku: product.sku,
          qty: item.qty,
          price: Number(product.price)
        });

        message += `• <b>${product.name}</b>\n`;
        message += `  Артикул: <code>${product.sku}</code>\n`;
        message += `  Цена: ${product.price}₸\n`;
        message += `  Количество: ${item.qty}\n`;
        message += `  Сумма: ${itemTotal}₸\n`;
        
        if (product.qty < item.qty) {
          message += `  ⚠️ В наличии: ${product.qty} шт.\n`;
        }
        message += '\n';
      }
    }

    message += `💰 <b>${locale === 'en' ? 'Total' : 'Итого'}: ${totalAmount}₸</b>\n\n`;

    // Update pending order with valid items
    session.pendingOrder!.items = validItems;

    // Prefill from session-level collected info if present
    if (!session.pendingOrder!.customerPhone && session.collectedCustomerPhone) {
      session.pendingOrder!.customerPhone = session.collectedCustomerPhone;
    }
    if (!session.pendingOrder!.customerName && session.collectedCustomerName) {
      session.pendingOrder!.customerName = session.collectedCustomerName;
    }

    // Check what information is missing
    const missing = this.getMissingOrderInfo(session.pendingOrder!);
    
    if (missing.length > 0) {
      message += locale === 'en' 
        ? `To complete your order, please provide:\n${missing.map(m => `• ${m}`).join('\n')}`
        : `Для завершения заказа укажите:\n${missing.map(m => `• ${m}`).join('\n')}`;
    } else {
      message += locale === 'en'
        ? 'All information collected! Please confirm your order.'
        : 'Вся информация собрана! Пожалуйста, подтвердите заказ.';
      session.pendingOrder!.step = 'confirming';
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
    
    if (session.pendingOrder!.step === 'confirming') {
      await this.showOrderConfirmation(ctx, session, originalText);
    }

    this.userSessions.set(ctx.from.id, session);
  }

  private async collectOrderInformation(ctx: any, session: UserSession, text: string) {
    const pendingOrder = session.pendingOrder!;
    const locale = session.locale;

    // Try to extract phone number
    const phoneMatch = text.match(/(\+7|8|7)[\s\-]?(\d{3})[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/);
    if (phoneMatch && !pendingOrder.customerPhone) {
      pendingOrder.customerPhone = phoneMatch[0].replace(/[\s\-]/g, '');
      if (!pendingOrder.customerPhone.startsWith('+7')) {
        pendingOrder.customerPhone = '+7' + pendingOrder.customerPhone.substring(1);
      }
      // Persist to session-level too
      session.collectedCustomerPhone = pendingOrder.customerPhone;
    }

    // Try to extract email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch && !pendingOrder.customerEmail) {
      pendingOrder.customerEmail = emailMatch[0];
    }

    // Try to extract name (avoid taking product codes or greetings as name)
    if (!pendingOrder.customerName && !phoneMatch && !emailMatch) {
      const raw = text.trim();
      const words = raw.split(/\s+/);
      const looksLikeCode = this.isLikelyProductCodeOrSku(raw);
      const looksTooShortOrSymbolic = /[\d_\-]/.test(raw) || raw.length < 2;
      const isGreeting = this.isGreeting(raw);
      if (!looksLikeCode && !looksTooShortOrSymbolic && !isGreeting && words.length >= 2 && words.length <= 4) {
        pendingOrder.customerName = raw;
        session.collectedCustomerName = raw;
      }
    }

    const missing = this.getMissingOrderInfo(pendingOrder);

    if (missing.length === 0) {
      pendingOrder.step = 'confirming';
      await this.showOrderConfirmation(ctx, session, text);
    } else {
      // Ask for next missing piece of information
      const nextMissing = missing[0];
      let prompt = '';
      
      switch (nextMissing) {
        case locale === 'en' ? 'Phone number' : 'Номер телефона':
          prompt = locale === 'en' 
            ? 'Please provide your phone number (format: +7 7xx xxx xx xx):'
            : 'Пожалуйста, укажите ваш номер телефона (формат: +7 7xx xxx xx xx):';
          break;
        case locale === 'en' ? 'Name' : 'Имя':
          prompt = locale === 'en' 
            ? 'Please provide your full name:'
            : 'Пожалуйста, укажите ваше ФИО:';
          break;
        default:
          prompt = locale === 'en'
            ? `Please provide: ${nextMissing}`
            : `Пожалуйста, укажите: ${nextMissing}`;
      }

      await ctx.reply(prompt);
    }

    this.userSessions.set(ctx.from.id, session);
  }

  private async showOrderConfirmation(ctx: any, session: UserSession, originalText: string) {
    const pendingOrder = session.pendingOrder!;
    const locale = session.locale;

    // Ensure we have a valid name before confirming; if missing or greeting-like, ask for it first
    if (!pendingOrder.customerName || this.isGreeting(pendingOrder.customerName)) {
      const prompt = locale === 'en' ? 'Please provide your full name:' : 'Пожалуйста, укажите ваше ФИО:';
      await ctx.reply(prompt);
      pendingOrder.step = 'collecting_info';
      this.userSessions.set(ctx.from.id, session);
      return;
    }

    const totalAmount = pendingOrder.items.reduce(
      (sum, item) => sum + item.price * item.qty, 0
    );

    let message = locale === 'en' 
      ? '✅ <b>Order Confirmation</b>\n\n'
      : '✅ <b>Подтверждение заказа</b>\n\n';

    message += locale === 'en' ? '<b>Items:</b>\n' : '<b>Товары:</b>\n';
    for (const item of pendingOrder.items) {
      message += `• ${item.name} x${item.qty} — ${item.price * item.qty}₸\n`;
    }

    message += `\n💰 <b>${locale === 'en' ? 'Total' : 'Итого'}: ${totalAmount}₸</b>\n\n`;

    message += locale === 'en' ? '<b>Customer info:</b>\n' : '<b>Информация о клиенте:</b>\n';
    if (pendingOrder.customerName) message += `${locale === 'en' ? 'Name' : 'Имя'}: ${pendingOrder.customerName}\n`;
    if (pendingOrder.customerPhone) message += `${locale === 'en' ? 'Phone' : 'Телефон'}: ${pendingOrder.customerPhone}\n`;
    if (pendingOrder.customerEmail) message += `Email: ${pendingOrder.customerEmail}\n`;

    message += locale === 'en' 
      ? '\nConfirm order? Reply "Yes" to proceed or "No" to cancel.'
      : '\nПодтвердить заказ? Ответьте "Да" для продолжения или "Нет" для отмены.';

    await ctx.reply(message, { parse_mode: 'HTML' });

    // Store original request text for order logging and mark ready
    pendingOrder.originalMessage = originalText;
    pendingOrder.step = 'ready';
    this.userSessions.set(ctx.from.id, session);
  }

  private async showProductInfo(ctx: any, session: UserSession, products: Product[]) {
    const locale = session.locale;
    
    const header = locale === 'en' 
      ? '📦 <b>Product Information:</b>\n\n'
      : '📦 <b>Информация о товарах:</b>\n\n';

    // Build entries
    const limited = products.slice(0, 15); // hard cap to 15 items
    const entries = limited.map((product) => {
      let block = `<b>${product.name}</b>\n`;
      block += `${locale === 'en' ? 'SKU' : 'Артикул'}: <code>${product.sku}</code>\n`;
      block += `${locale === 'en' ? 'Price' : 'Цена'}: ${product.price}₸\n`;
      block += `${locale === 'en' ? 'In stock' : 'В наличии'}: ${product.qty} ${locale === 'en' ? 'pcs' : 'шт'}\n`;
      if (product.url) {
        block += `${locale === 'en' ? 'More info' : 'Подробнее'}: ${product.url}\n`;
      }
      return block + '\n';
    });

    // Chunk by characters to keep under Telegram limit
    const MAX_CHARS = 3500; // Safe under 4096
    let current = header;
    for (const entry of entries) {
      if ((current + entry).length > MAX_CHARS) {
        await ctx.reply(current, { parse_mode: 'HTML' });
        current = entry; // Start new chunk without header to save space
      } else {
        current += entry;
      }
    }

    // Append call-to-action
    const moreNote = products.length > limited.length
      ? (locale === 'en' ? `Showing first ${limited.length} results out of ${products.length}.\n` : `Показаны первые ${limited.length} из ${products.length} результатов.\n`)
      : '';
    const cta = (locale === 'en'
      ? `${moreNote}Would you like to order any of these products? Please specify the SKU(s) and quantities (e.g., "REV-41-1303 x2").`
      : `${moreNote}Хотите заказать какие-либо из этих товаров? Укажите артикулы и количество (например, "REV-41-1303 x2").`);

    if ((current + cta).length > MAX_CHARS) {
      await ctx.reply(current, { parse_mode: 'HTML' });
      await ctx.reply(cta, { parse_mode: 'HTML' });
    } else {
      current += cta;
      await ctx.reply(current, { parse_mode: 'HTML' });
    }
  }

  private async handleOrderStatusCheck(ctx: any, orderNumber: string) {
    try {
      const order = await this.orderService.findOrderByNumber(orderNumber.toUpperCase());
      
      if (!order) {
        const userId = ctx.from.id;
        const session = this.userSessions.get(userId);
        const locale = session?.locale || 'ru';
        
        const message = locale === 'en'
          ? `Order ${orderNumber} not found. Please check the order number and try again.`
          : `Заказ ${orderNumber} не найден. Проверьте номер заказа и попробуйте еще раз.`;
        
        await ctx.reply(message);
        return;
      }

      const locale = order.customer.locale || 'ru';
      const statusText = this.getStatusText(order.status, locale);
      
      let message = `📋 <b>${locale === 'en' ? 'Order Status' : 'Статус заказа'}</b>\n\n`;
      message += `${locale === 'en' ? 'Order' : 'Заказ'}: <code>${order.number}</code>\n`;
      message += `${locale === 'en' ? 'Status' : 'Статус'}: ${statusText}\n`;
      message += `${locale === 'en' ? 'Total' : 'Сумма'}: ${order.totalAmount}₸\n`;
      message += `${locale === 'en' ? 'Created' : 'Создан'}: ${order.createdAt.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}\n\n`;

      message += `<b>${locale === 'en' ? 'Items' : 'Товары'}:</b>\n`;
      for (const item of order.items) {
        message += `• ${item.name} x${item.qty} — ${item.amount}₸\n`;
      }

      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('❌ Error checking order status:', error);
      await ctx.reply(
        'Произошла ошибка при проверке статуса заказа. Попробуйте позже.'
      );
    }
  }

  private getMissingOrderInfo(order: UserSession['pendingOrder']): string[] {
    const missing: string[] = [];
    
    if (!order!.customerPhone) {
      missing.push('Номер телефона');
    }
    if (!order!.customerName) {
      missing.push('Имя');
    }

    return missing;
  }

  private buildProductContext(products: Product[]): string {
    if (products.length === 0) return '';
    
    return 'Available products:\n' + products
      .map(p => `${p.name} — ${p.price}₸ (SKU: ${p.sku})${p.url ? ` — ${p.url}` : ''}`)
      .join('\n');
  }

  private isOrderNumberQuery(text: string): boolean {
    return /KG-\d{4}-\d{6}/i.test(text);
  }

  private getStatusText(status: string, locale: string): string {
    const statusMap = {
      'NEW': locale === 'en' ? '🟡 New' : '🟡 Новый',
      'PENDING': locale === 'en' ? '🟠 Pending' : '🟠 В обработке',
      'CONFIRMED': locale === 'en' ? '🟢 Confirmed' : '🟢 Подтвержден',
      'PAID': locale === 'en' ? '💚 Paid' : '💚 Оплачен',
      'SHIPPED': locale === 'en' ? '🚚 Shipped' : '🚚 Отправлен',
      'CLOSED': locale === 'en' ? '✅ Closed' : '✅ Завершен',
      'CANCELLED': locale === 'en' ? '❌ Cancelled' : '❌ Отменен'
    };

    return statusMap[status] || status;
  }

  private isGreeting(text: string): boolean {
    const t = text.trim().toLowerCase();
    const greetings = [
      'привет', 'здравствуйте', 'салам', 'салем', 'салом', 'добрый день', 'доброе утро', 'добрый вечер',
      'hi', 'hello', 'hey', 'good morning', 'good evening'
    ];
    return greetings.includes(t);
  }

  // Heuristic to detect if a free-text looks like a product code/SKU (e.g., REV-41, REV-41-1303, RPI4B-4GB)
  private isLikelyProductCodeOrSku(text: string): boolean {
    const t = text.trim();
    // Contains uppercase letters with digits and hyphens or looks like code-like token
    if (/^[A-Za-zА-Яа-я]{2,6}[\s\-]?\d{2,6}([\-A-Za-z0-9]{0,10})?$/.test(t)) return true;
    if (/\bREV[\s\-]?\d{2,4}/i.test(t)) return true;
    return false;
  }

  // Extract explicit SKU from user text (matches like REV-41-1305-PK8)
  private extractSkuFromText(text: string): string | null {
    if (!text) return null;
    const m = text.match(/[A-Z]{2,6}-\d{2,4}(?:-[A-Z0-9]{2,10})+/i);
    return m ? m[0].toUpperCase() : null;
  }

  // Extract quantity patterns like "x10", "10 шт", "10 штук", "10pcs"
  private extractQtyFromText(text: string): number | null {
    if (!text) return null;
    // x10 or x 10
    const xMatch = text.match(/x\s?(\d{1,4})/i);
    if (xMatch) return parseInt(xMatch[1], 10);
    // 10 шт|штук|pcs|pieces
    const wordsMatch = text.match(/\b(\d{1,4})\s?(шт|штук|pcs|pieces)\b/i);
    if (wordsMatch) return parseInt(wordsMatch[1], 10);
    return null;
  }

  // Collect phone/name opportunistically even outside of an active order
  private tryCollectContactInfo(session: UserSession, text: string) {
    if (!text) return;
    const phoneMatch = text.match(/(\+7|8|7)[\s\-]?(\d{3})[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/);
    if (phoneMatch && !session.collectedCustomerPhone) {
      let phone = phoneMatch[0].replace(/[\s\-]/g, '');
      if (!phone.startsWith('+7')) phone = '+7' + phone.substring(1);
      session.collectedCustomerPhone = phone;
    }

    if (!session.collectedCustomerName) {
      const raw = text.trim();
      const words = raw.split(/\s+/);
      const looksLikeCode = this.isLikelyProductCodeOrSku(raw);
      const looksTooShortOrSymbolic = /[\d_\-]/.test(raw) || raw.length < 2;
      if (!looksLikeCode && !looksTooShortOrSymbolic && words.length <= 4) {
        session.collectedCustomerName = raw;
      }
    }
  }

  private async handleOrderConfirmation(ctx: any, session: UserSession, text: string, originalMessage: string) {
    const userId = ctx.from.id;
    const locale = session.locale;
    const isConfirmed = /^(да|yes|y|д|\+)$/i.test(text.trim());
    const isRejected = /^(нет|no|n|н|-)$/i.test(text.trim());

    if (isConfirmed) {
      try {
        const order = await this.orderService.createOrder({
          customerPhone: session.pendingOrder!.customerPhone!,
          customerName: session.pendingOrder!.customerName,
          customerEmail: session.pendingOrder!.customerEmail,
          tgUserId: userId.toString(),
          items: session.pendingOrder!.items,
          source: 'telegram',
          originalMessage: originalMessage,
          locale: locale
        });

        const message = locale === 'en'
          ? `✅ <b>Order created successfully!</b>\n\nOrder number: <code>${order.number}</code>\nTotal: ${order.totalAmount}₸\n\nOur manager will contact you shortly to confirm delivery details and payment.\n\nThank you for your order! 🙏`
          : `✅ <b>Заказ успешно создан!</b>\n\nНомер заказа: <code>${order.number}</code>\nСумма: ${order.totalAmount}₸\n\nНаш менеджер свяжется с вами в ближайшее время для уточнения деталей доставки и оплаты.\n\nСпасибо за заказ! 🙏`;

        await ctx.reply(message, { parse_mode: 'HTML' });

        // Clear pending order
        session.pendingOrder = undefined;
        session.messages = []; // Reset conversation
        this.userSessions.set(userId, session);

      } catch (error) {
        console.error('❌ Error creating order:', error);
        
        const errorMessage = locale === 'en'
          ? 'Sorry, there was an error creating your order. Please try again or contact our support.'
          : 'Извините, произошла ошибка при создании заказа. Попробуйте еще раз или обратитесь в поддержку.';
        
        await ctx.reply(errorMessage);
        throw error; // Re-throw for debugging purposes
      }
    } else if (isRejected) {
      session.pendingOrder = undefined;
      this.userSessions.set(userId, session);
      
      const message = locale === 'en'
        ? '❌ Order cancelled. How can I help you?'
        : '❌ Заказ отменен. Чем могу помочь?';
      
      await ctx.reply(message);
    } else {
      const message = locale === 'en'
        ? 'Please reply "Yes" to confirm or "No" to cancel the order.'
        : 'Пожалуйста, ответьте "Да" для подтверждения или "Нет" для отмены заказа.';
      
      await ctx.reply(message);
    }
  }
}