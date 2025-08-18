// api/src/notifications/manager-notification.service.ts
import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';

export interface OrderNotificationData {
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    name: string;
    sku: string;
    qty: number;
    price: number;
    amount: number;
  }>;
  totalAmount: number;
  currency: string;
  customerMessage: string;
  orderNumber: string;
  orderId: string;
}

@Injectable()
export class ManagerNotificationService {
  private readonly managerChannelId: string;

  constructor(
    @InjectBot() private bot: Telegraf,
    private prisma: PrismaService,
  ) {
    this.managerChannelId = process.env.TELEGRAM_MANAGER_CHANNEL_ID!;
    if (!this.managerChannelId) {
      console.warn('⚠️ TELEGRAM_MANAGER_CHANNEL_ID not set - manager notifications disabled');
    }
  }

  async notifyNewOrder(orderData: OrderNotificationData): Promise<void> {
    if (!this.managerChannelId) {
      console.warn('Manager channel not configured, skipping notification');
      return;
    }

    try {
      const message = this.formatOrderMessage(orderData);
      const keyboard = this.createOrderKeyboard(orderData.orderId);

      await this.bot.telegram.sendMessage(
        this.managerChannelId,
        message,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard
        }
      );

      console.log(`✅ Order notification sent to managers: ${orderData.orderNumber}`);
    } catch (error) {
      console.error('❌ Failed to send manager notification:', error);
    }
  }

  private formatOrderMessage(data: OrderNotificationData): string {
    const itemsList = data.items
      .map(item => `• <b>${item.name}</b> x${item.qty} — ${item.amount}₸`)
      .join('\n');

    return `
🆕 <b>НОВЫЙ ЗАКАЗ</b>
📝 Номер: <code>${data.orderNumber}</code>

👤 <b>Клиент:</b>
${data.customerName ? `Имя: ${data.customerName}` : ''}
${data.customerPhone ? `📞 Телефон: <code>${data.customerPhone}</code>` : '❌ Телефон не указан'}

🛒 <b>Товары:</b>
${itemsList}

💰 <b>Сумма:</b> ${data.totalAmount} ${data.currency}

💬 <b>Сообщение клиента:</b>
"${data.customerMessage}"

⏰ Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}
    `.trim();
  }

  private createOrderKeyboard(orderId: string) {
    return {
      inline_keyboard: [
        [
          { text: '✅ Подтвердить', callback_data: `confirm_order:${orderId}` },
          { text: '❌ Отклонить', callback_data: `reject_order:${orderId}` }
        ],
        [
          { text: '📞 Связаться', callback_data: `contact_customer:${orderId}` },
          { text: '✏️ Изменить', callback_data: `edit_order:${orderId}` }
        ]
      ]
    };
  }

  // Handle manager button clicks
  async handleManagerAction(callbackQuery: any): Promise<void> {
    const data = callbackQuery.data;
    const [action, orderId] = data.split(':');

    try {
      switch (action) {
        case 'confirm_order':
          await this.confirmOrder(orderId, callbackQuery.from.id);
          break;
        case 'reject_order':
          await this.rejectOrder(orderId, callbackQuery.from.id);
          break;
        case 'contact_customer':
          await this.handleContactCustomer(orderId, callbackQuery);
          break;
        case 'edit_order':
          await this.handleEditOrder(orderId, callbackQuery);
          break;
      }
    } catch (error) {
      console.error(`❌ Error handling manager action ${action}:`, error);
      await this.bot.telegram.answerCbQuery(
        callbackQuery.id,
        'Произошла ошибка. Попробуйте еще раз.'
      );
    }
  }

  private async confirmOrder(orderId: string, managerId: number): Promise<void> {
    // Update order status to CONFIRMED
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { 
        status: 'CONFIRMED',
        // TODO: Add managerId field to Order model
      },
      include: { 
        customer: true,
        items: { include: { product: true } }
      }
    });

    // Send confirmation to customer via bot
    if (order.customer.tgUserId) {
      const message = `
✅ <b>Заказ подтвержден!</b>

📝 Номер заказа: <code>${order.number}</code>
💰 Сумма: ${order.totalAmount} ${order.currency}

Наш менеджер свяжется с вами в ближайшее время для уточнения деталей доставки и оплаты.

Спасибо за заказ! 🙏
      `.trim();

      try {
        await this.bot.telegram.sendMessage(
          order.customer.tgUserId,
          message,
          { parse_mode: 'HTML' }
        );
      } catch (error) {
        console.error('Failed to send confirmation to customer:', error);
      }
    }

    console.log(`✅ Order ${order.number} confirmed by manager ${managerId}`);
  }

  private async rejectOrder(orderId: string, managerId: number): Promise<void> {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
      include: { customer: true }
    });

    // Send rejection notice to customer
    if (order.customer.tgUserId) {
      const message = `
❌ <b>Заказ отклонен</b>

📝 Номер заказа: <code>${order.number}</code>

К сожалению, мы не можем выполнить ваш заказ. 
Наш менеджер свяжется с вами для объяснения причин.

Приносим извинения за неудобства.
      `.trim();

      try {
        await this.bot.telegram.sendMessage(
          order.customer.tgUserId,
          message,
          { parse_mode: 'HTML' }
        );
      } catch (error) {
        console.error('Failed to send rejection notice to customer:', error);
      }
    }

    console.log(`❌ Order ${order.number} rejected by manager ${managerId}`);
  }

  private async handleContactCustomer(orderId: string, callbackQuery: any): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true }
    });

    if (!order) {
      await this.bot.telegram.answerCbQuery(
        callbackQuery.id,
        'Заказ не найден'
      );
      return;
    }

    const contactInfo = `
📞 <b>Контакты клиента</b>

📝 Заказ: <code>${order.number}</code>
${order.customer.name ? `👤 Имя: ${order.customer.name}` : ''}
📞 Телефон: <code>${order.customer.phone}</code>
${order.customer.email ? `📧 Email: ${order.customer.email}` : ''}

Вы можете связаться с клиентом по указанным контактам.
    `.trim();

    await this.bot.telegram.sendMessage(
      callbackQuery.from.id,
      contactInfo,
      { parse_mode: 'HTML' }
    );

    await this.bot.telegram.answerCbQuery(
      callbackQuery.id,
      'Контакты отправлены в личные сообщения'
    );
  }

  private async handleEditOrder(orderId: string, callbackQuery: any): Promise<void> {
    // For now, just provide a message with instructions
    // In a full implementation, you might create an inline form or redirect to admin panel
    await this.bot.telegram.answerCbQuery(
      callbackQuery.id,
      'Для изменения заказа обратитесь к админ-панели или свяжитесь с клиентом напрямую',
    //   true
    );
  }
}