// api/src/orders/order.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductService } from '../products/product.service';
import { ManagerNotificationService } from '../notifications/manager-notification.service';
import { Customer, Order, OrderItem, Product } from '@prisma/client';

export interface CreateOrderData {
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  tgUserId?: string;
  items: Array<{
    name: string;
    sku?: string;
    qty: number;
  }>;
  source: string;
  originalMessage: string;
  locale?: string;
}

export interface OrderWithDetails extends Order {
  customer: Customer;
  items: (OrderItem & { product: Product })[];
}

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private productService: ProductService,
    private managerNotification: ManagerNotificationService
  ) {}

  async createOrder(data: CreateOrderData): Promise<OrderWithDetails> {
    console.log('📝 Starting order creation with data:', JSON.stringify(data, null, 2));

    // Step 1: Find or create customer
    console.log('🔍 Finding or creating customer...');
    const customer = await this.findOrCreateCustomer({
      phone: data.customerPhone,
      name: data.customerName,
      email: data.customerEmail,
      tgUserId: data.tgUserId,
      locale: data.locale || 'ru'
    });
    console.log('✅ Customer found/created:', customer.id, customer.phone);

    // Step 2: Process and validate items
    console.log('🛒 Processing order items...');
    const processedItems = await this.processOrderItems(data.items);
    console.log('✅ Processed items:', JSON.stringify(processedItems, null, 2));
    
    if (processedItems.length === 0) {
      console.error('❌ No valid items found for order');
      throw new Error('No valid items found for order');
    }

    // Step 3: Calculate total amount
    const totalAmount = processedItems.reduce(
      (sum, item) => sum + Number(item.price) * item.qty, 
      0
    );
    console.log('💰 Total amount calculated:', totalAmount);

    // Step 4: Generate order number
    console.log('🔢 Generating order number...');
    const orderNumber = await this.generateOrderNumber();
    console.log('✅ Order number generated:', orderNumber);

    // Step 5: Create order in database
    console.log('📦 Creating order in database...');
    try {
      const order = await this.prisma.order.create({
        data: {
          number: orderNumber,
          customerId: customer.id,
          status: 'NEW',
          totalAmount: totalAmount,
          currency: 'KZT',
          source: data.source,
          items: {
            create: processedItems.map(item => ({
              productId: item.productId,
              sku: item.sku,
              name: item.name,
              qty: item.qty,
              price: item.price,
              amount: Number(item.price) * item.qty
            }))
          }
        },
        include: {
          customer: true,
          items: {
            include: {
              product: true
            }
          }
        }
      });
      console.log('✅ Order created in database:', order.id, order.number);

      // Step 6: Save original message
      console.log('💬 Saving original message...');
      await this.prisma.message.create({
        data: {
          customerId: customer.id,
          orderId: order.id,
          channel: data.source,
          direction: 'in',
          body: data.originalMessage,
          meta: {
            locale: data.locale,
            processedAt: new Date().toISOString()
          }
        }
      });
      console.log('✅ Message saved');

      // Step 7: Send notification to managers
      console.log('📢 Notifying managers...');
      await this.notifyManagers(order, data.originalMessage);
      console.log('✅ Managers notified');

      console.log(`✅ Order created successfully: ${orderNumber} for customer ${customer.phone}`);
      return order;
    } catch (error) {
      console.error('❌ Failed to create order in database:', error);
      throw error; // Re-throw to ensure the error propagates
    }
  }

  private async findOrCreateCustomer(customerData: {
    phone: string;
    name?: string;
    email?: string;
    tgUserId?: string;
    locale: string;
  }): Promise<Customer> {
    // Try to find existing customer by phone
    let customer = await this.prisma.customer.findUnique({
      where: { phone: customerData.phone }
    });

    if (customer) {
      // Update customer info if new data is provided
      const updates: any = {};
      if (customerData.name && !customer.name) updates.name = customerData.name;
      if (customerData.email && !customer.email) updates.email = customerData.email;
      if (customerData.tgUserId && !customer.tgUserId) updates.tgUserId = customerData.tgUserId;
      if (customerData.locale !== customer.locale) updates.locale = customerData.locale;

      if (Object.keys(updates).length > 0) {
        customer = await this.prisma.customer.update({
          where: { id: customer.id },
          data: updates
        });
      }
    } else {
      // Create new customer
      customer = await this.prisma.customer.create({
        data: customerData
      });
    }

    return customer;
  }

private async processOrderItems(
  requestedItems: CreateOrderData['items']
): Promise<Array<{
  productId: string;
  sku: string;
  name: string;
  qty: number;
  price: number;
}>> {
  const processedItems: {
    productId: string;
    sku: string;
    name: string;
    qty: number;
    price: number;
  }[] = [];

  for (const item of requestedItems) {
    try {
      let products: Product[] = [];

      if (item.sku) {
        const product = await this.prisma.product.findFirst({
          where: { sku: item.sku, isActive: true }
        });
        if (product) products = [product];
      }

      if (products.length === 0) {
        products = await this.prisma.product.findMany({
          where: { name: item.name, isActive: true },
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            currency: true,
            stockQty: true,
            isActive: true,
            createdAt: true,
            updatedAt: true
          }
        });
      }

      if (products.length === 0) {
        console.warn(`⚠️ Product not found: ${item.name} (SKU: ${item.sku})`);
        continue;
      }

      const product = products[0];

      if (product.stockQty < item.qty) {
        console.warn(
          `⚠️ Insufficient stock for ${product.name}: requested ${item.qty}, available ${product.stockQty}`
        );
      }

      processedItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        qty: item.qty,
        price: Number(product.price)
      });

    } catch (error) {
      console.error(`❌ Error processing item ${item.name}:`, error);
    }
  }

  return processedItems;
}


  private async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `KG-${year}-`;
    
    // Get the last order number for this year
    const lastOrder = await this.prisma.order.findFirst({
      where: {
        number: {
          startsWith: prefix
        }
      },
      orderBy: {
        number: 'desc'
      }
    });

    let nextNumber = 1;
    if (lastOrder) {
      const lastNumberStr = lastOrder.number.replace(prefix, '');
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    return `${prefix}${nextNumber.toString().padStart(6, '0')}`;
  }

  private async notifyManagers(order: OrderWithDetails, originalMessage: string): Promise<void> {
    try {
      await this.managerNotification.notifyNewOrder({
        orderNumber: order.number,
        orderId: order.id,
        customerName: order.customer.name ?? undefined,
        customerPhone: order.customer.phone,
        items: order.items.map(item => ({
          name: item.name,
          sku: item.sku,
          qty: item.qty,
          price: Number(item.price),
          amount: Number(item.amount)
        })),
        totalAmount: Number(order.totalAmount),
        currency: order.currency,
        customerMessage: originalMessage
      });
    } catch (error) {
      console.error('❌ Failed to notify managers:', error);
      // Don't throw error - order creation should succeed even if notification fails
    }
  }

  // Utility method to get order by number (for status checks)
  async findOrderByNumber(orderNumber: string): Promise<OrderWithDetails | null> {
    return await this.prisma.order.findUnique({
      where: { number: orderNumber },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });
  }

  // Utility method to get orders for a customer
  async getCustomerOrders(phone: string): Promise<OrderWithDetails[]> {
    const customer = await this.prisma.customer.findUnique({
      where: { phone }
    });

    if (!customer) return [];

    return await this.prisma.order.findMany({
      where: { customerId: customer.id },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}