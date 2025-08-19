// api/src/orders/order.service.ts
import { Injectable } from '@nestjs/common';
import { ProductService } from '../products/product.service';
import { ManagerNotificationService } from '../notifications/manager-notification.service';
import { supabase } from '../config/supabase';

export interface CreateOrderData {
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  tgUserId?: string;
  items: Array<{
    name: string;
    sku?: string;
    qty: number;
    price?: number;
  }>;
  source: string;
  originalMessage: string;
  locale?: string;
}

// Local camelCase types used by services
export interface Customer {
  id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  tgUserId?: string | null;
  locale: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  currency: string;
  qty: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  sku: string;
  name: string;
  qty: number;
  price: number;
  amount: number;
  product?: Product;
}

export interface Order {
  id: string;
  number: string;
  customerId: string;
  status: string;
  totalAmount: number;
  currency: string;
  source: string;
  createdAt: Date;
}

export interface OrderWithDetails extends Order {
  customer: Customer;
  items: OrderItem[];
}

@Injectable()
export class OrderService {
  constructor(
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
      const { data: createdOrder, error: orderInsertError } = await supabase
        .from('orders')
        .insert({
          number: orderNumber,
          customer_id: customer.id,
          status: 'NEW',
          total_amount: totalAmount,
          currency: 'KZT',
          source: data.source,
        })
        .select('*')
        .single();

      if (orderInsertError || !createdOrder) {
        console.error('❌ Failed to insert order:', orderInsertError);
        throw orderInsertError || new Error('Failed to insert order');
      }

      // Insert order items
      const itemsToInsert = processedItems.map(item => ({
        order_id: createdOrder.id,
        product_id: item.productId,
        sku: item.sku,
        name: item.name,
        qty: item.qty,
        price: item.price,
        amount: Number(item.price) * item.qty,
      }));

      const { error: itemsInsertError } = await supabase
        .from('order_items')
        .insert(itemsToInsert);

      if (itemsInsertError) {
        console.error('❌ Failed to insert order items:', itemsInsertError);
        throw itemsInsertError;
      }

      console.log('✅ Order and items created in database:', createdOrder.id, createdOrder.number);

      // Step 6: Save original message
      console.log('💬 Saving original message...');
      const { error: messageInsertError } = await supabase
        .from('messages')
        .insert({
          customer_id: customer.id,
          order_id: createdOrder.id,
          channel: data.source,
          direction: 'in',
          body: data.originalMessage,
          meta: {
            locale: data.locale,
            processedAt: new Date().toISOString()
          }
        });

      if (messageInsertError) {
        console.error('❌ Failed to save message:', messageInsertError);
        // Do not fail the whole flow on message logging failure
      } else {
        console.log('✅ Message saved');
      }

      // Compose full order with relations
      const orderWithDetails = await this.composeOrderWithDetails(createdOrder.id);

      // Step 7: Send notification to managers
      console.log('📢 Notifying managers...');
      await this.notifyManagers(orderWithDetails, data.originalMessage);
      console.log('✅ Managers notified');

      console.log(`✅ Order created successfully: ${orderNumber} for customer ${customer.phone}`);
      return orderWithDetails;
    } catch (error) {
      console.error('❌ Failed to create order in database:', error);
      throw error; // Re-throw to ensure the error propagates
    }
  }

  private async composeOrderWithDetails(orderId: string): Promise<OrderWithDetails> {
    // Load order
    const { data: orderRow, error: orderLoadError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderLoadError || !orderRow) {
      throw orderLoadError || new Error('Order not found after creation');
    }

    // Load customer
    const { data: customerRow, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', orderRow.customer_id)
      .single();

    if (customerError || !customerRow) {
      throw customerError || new Error('Customer not found for order');
    }

    // Load items
    const { data: itemRows, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderRow.id);

    if (itemsError || !itemRows) {
      throw itemsError || new Error('Order items not found');
    }

    // Load products for items
    const productIds = itemRows.map(i => i.product_id);
    const { data: productRows, error: productsError } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds);

    if (productsError || !productRows) {
      throw productsError || new Error('Products not found for order items');
    }

    const productsById = new Map<string, any>();
    for (const p of productRows) {
      productsById.set(p.id, p);
    }

    const order: OrderWithDetails = {
      id: orderRow.id,
      number: orderRow.number,
      customerId: orderRow.customer_id,
      status: orderRow.status,
      totalAmount: Number(orderRow.total_amount),
      currency: orderRow.currency,
      source: orderRow.source,
      createdAt: new Date(orderRow.created_at),
      customer: {
        id: customerRow.id,
        phone: customerRow.phone,
        name: customerRow.name,
        email: customerRow.email,
        tgUserId: customerRow.tg_user_id,
        locale: customerRow.locale,
      },
      items: itemRows.map(ir => {
        const pr = productsById.get(ir.product_id);
        const item: OrderItem = {
          id: ir.id,
          orderId: ir.order_id,
          productId: ir.product_id,
          sku: ir.sku,
          name: ir.name,
          qty: Number(ir.qty),
          price: Number(ir.price),
          amount: Number(ir.amount),
          product: pr ? {
            id: pr.id,
            sku: pr.sku,
            name: pr.name,
            price: Number(pr.price),
            currency: pr.currency,
            qty: Number(pr.qty),
          } : undefined,
        };
        return item;
      })
    };

    return order;
  }

  private async findOrCreateCustomer(customerData: {
    phone: string;
    name?: string;
    email?: string;
    tgUserId?: string;
    locale: string;
  }): Promise<Customer> {
    // Try to find existing customer by phone
    const { data: existing, error: findError } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', customerData.phone)
      .maybeSingle();

    if (findError) {
      console.error('❌ Error finding customer:', findError);
    }

    let customerRow = existing;

    if (customerRow) {
      // Update customer info if new data is provided
      const updates: any = {};
      if (customerData.name && !customerRow.name) updates.name = customerData.name;
      if (customerData.email && !customerRow.email) updates.email = customerData.email;
      if (customerData.tgUserId && !customerRow.tg_user_id) updates.tg_user_id = customerData.tgUserId;
      if (customerData.locale && customerData.locale !== customerRow.locale) updates.locale = customerData.locale;

      if (Object.keys(updates).length > 0) {
        const { data: updated, error: updateError } = await supabase
          .from('customers')
          .update(updates)
          .eq('id', customerRow.id)
          .select('*')
          .single();
        if (updateError) {
          console.error('❌ Failed to update customer:', updateError);
        } else {
          customerRow = updated;
        }
      }
    } else {
      // Create new customer
      const { data: created, error: createError } = await supabase
        .from('customers')
        .insert({
          phone: customerData.phone,
          name: customerData.name,
          email: customerData.email,
          tg_user_id: customerData.tgUserId,
          locale: customerData.locale,
        })
        .select('*')
        .single();

      if (createError || !created) {
        console.error('❌ Failed to create customer:', createError);
        throw createError || new Error('Failed to create customer');
      }

      customerRow = created;
    }

    const customer: Customer = {
      id: customerRow.id,
      phone: customerRow.phone,
      name: customerRow.name,
      email: customerRow.email,
      tgUserId: customerRow.tg_user_id,
      locale: customerRow.locale,
    };

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
        let productRow: any | null = null;

        // 1) Try by SKU exact or partial (supports numeric/text)
        if (item.sku) {
          let db = supabase
            .from('products')
            .select('id, name, sku, price, currency, qty')
            .or(`sku.eq.${item.sku},sku.ilike.%${item.sku}%`)
            .limit(1);
          const { data: bySku } = await db;
          if (bySku && bySku.length > 0) {
            productRow = bySku[0];
          }
        }

        // 2) If not found, use fuzzy name search via ProductService
        if (!productRow && item.name) {
          const matches = await this.productService.findByName(item.name);
          if (matches && matches.length > 0) {
            const m = matches[0];
            productRow = {
              id: m.id,
              name: m.name,
              sku: m.sku,
              price: Number(m.price),
              currency: 'KZT',
              qty: Number(m.qty)
            };
          }
        }

        if (!productRow) {
          console.warn(`⚠️ Product not found: ${item.name} (SKU: ${item.sku})`);
          continue;
        }

        // 3) Quantity check (soft)
        if (Number(productRow.qty) < item.qty) {
          console.warn(
            `⚠️ Insufficient stock for ${productRow.name}: requested ${item.qty}, available ${productRow.qty}`
          );
        }

        // 4) Use provided price if present, else DB price
        const finalPrice = item.price != null ? Number(item.price) : Number(productRow.price);

        processedItems.push({
          productId: productRow.id,
          sku: productRow.sku,
          name: productRow.name,
          qty: item.qty,
          price: finalPrice,
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
    const { data: lastOrders, error } = await supabase
      .from('orders')
      .select('number')
      .like('number', `${prefix}%`)
      .order('number', { ascending: false })
      .limit(1);

    if (error) {
      console.error('❌ Failed to get last order number:', error);
    }

    let nextNumber = 1;
    if (lastOrders && lastOrders.length > 0) {
      const lastNumberStr = lastOrders[0].number.replace(prefix, '');
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
    // Find order row
    const { data: orderRow } = await supabase
      .from('orders')
      .select('*')
      .eq('number', orderNumber)
      .maybeSingle();

    if (!orderRow) return null;

    return await this.composeOrderWithDetails(orderRow.id);
  }

  // Utility method to get orders for a customer
  async getCustomerOrders(phone: string): Promise<OrderWithDetails[]> {
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (!customer) return [];

    const { data: orders } = await supabase
      .from('orders')
      .select('id')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });

    if (!orders || orders.length === 0) return [];

    const results: OrderWithDetails[] = [];
    for (const o of orders) {
      results.push(await this.composeOrderWithDetails(o.id));
    }
    return results;
  }

  // Utility: list orders with filters
  async listOrders(params: { status?: string; q?: string; dateFrom?: string; dateTo?: string; limit: number; offset: number; }) {
    const { status, q, dateFrom, dateTo, limit, offset } = params;

    let query = supabase.from('orders').select('*').order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status.toUpperCase());
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }
    if (q) {
      // filter by number or by customer match after fetch
    }

    const { data: orderRows, error } = await query.range(offset, offset + limit - 1);
    if (error || !orderRows) return [];

    // Load customers for these orders
    const customerIds = Array.from(new Set(orderRows.map(o => o.customer_id)));
    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .in('id', customerIds);
    const byCustomer: Record<string, any> = Object.fromEntries((customers || []).map(c => [c.id, c]));

    // Load totals via items
    const orderIds = orderRows.map(o => o.id);
    const { data: items } = await supabase
      .from('order_items')
      .select('order_id, amount');

    const totals = new Map<string, number>();
    (items || []).forEach(i => totals.set(i.order_id, (totals.get(i.order_id) || 0) + Number(i.amount)));

    const results = orderRows.map(o => ({
      id: o.id,
      number: o.number,
      status: o.status,
      customer: {
        id: byCustomer[o.customer_id]?.id,
        name: byCustomer[o.customer_id]?.name,
        phone: byCustomer[o.customer_id]?.phone,
        email: byCustomer[o.customer_id]?.email,
      },
      totalAmount: Number(o.total_amount ?? totals.get(o.id) ?? 0),
      currency: o.currency,
      source: o.source,
      createdAt: new Date(o.created_at)
    }));

    if (q) {
      const qLower = q.toLowerCase();
      return results.filter(r => r.number.toLowerCase().includes(qLower) || (r.customer?.name || '').toLowerCase().includes(qLower));
    }

    return results;
  }

  async updateOrderStatus(orderId: string, status: string, managerId?: string) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status: status.toUpperCase(), manager_id: managerId || null })
      .eq('id', orderId)
      .select('*')
      .maybeSingle();

    if (error || !data) return null;

    return await this.composeOrderWithDetails(orderId);
  }

  async listCustomers() {
    // Get all customers with their order counts and totals
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (customersError || !customers) return [];

    // Get order counts and totals for each customer
    const customerIds = customers.map(c => c.id);
    const { data: orders } = await supabase
      .from('orders')
      .select('customer_id, total_amount, status, created_at')
      .in('customer_id', customerIds);

    // Calculate stats per customer
    const customerStats = new Map<string, { orderCount: number; totalSpent: number; lastOrder: Date | null }>();
    
    (orders || []).forEach(order => {
      const customerId = order.customer_id;
      const current = customerStats.get(customerId) || { orderCount: 0, totalSpent: 0, lastOrder: null };
      
      // Only count successful orders (not cancelled/declined)
      if (order.status !== 'CANCELLED' && order.status !== 'REJECTED') {
        current.orderCount += 1;
        current.totalSpent += Number(order.total_amount || 0);
      }
      
      const orderDate = new Date(order.created_at);
      if (!current.lastOrder || orderDate > current.lastOrder) {
        current.lastOrder = orderDate;
      }
      
      customerStats.set(customerId, current);
    });

    return customers.map(customer => {
      const stats = customerStats.get(customer.id) || { orderCount: 0, totalSpent: 0, lastOrder: null };
      return {
        id: customer.id,
        name: customer.name || 'Без имени',
        phone: customer.phone,
        email: customer.email,
        orders: stats.orderCount,
        totalSpent: stats.totalSpent,
        lastOrder: stats.lastOrder,
        createdAt: new Date(customer.created_at)
      };
    });
  }

  async getAnalytics() {
    // Get all orders for analytics
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (ordersError || !orders) return { totalOrders: 0, totalRevenue: 0, statusCounts: {}, averageOrder: 0 };

    // Calculate analytics excluding cancelled/rejected orders
    const successfulOrders = orders.filter(o => o.status !== 'CANCELLED' && o.status !== 'REJECTED');
    const totalOrders = successfulOrders.length;
    const totalRevenue = successfulOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const averageOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Count by status
    const statusCounts = orders.reduce((acc: Record<string, number>, order) => {
      const status = order.status.toLowerCase();
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Get customer count
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id');
    
    const customerCount = customersError ? 0 : (customers?.length || 0);

    return {
      totalOrders,
      totalRevenue,
      customerCount,
      averageOrder,
      statusCounts
    };
  }
}