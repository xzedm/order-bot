export interface Customer {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  tg_user_id?: string;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  currency: string;
  qty: number;  // Assuming this is stock_qty from your screenshot
  is_active: boolean;
  url?: string;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  number: string;
  customer_id: string;
  status: string;
  total_amount: number;
  currency: string;
  source: string;
  manager_id?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  sku: string;
  name: string;
  qty: number;
  price: number;
  amount: number;
}

export interface Message {
  id: string;
  customer_id?: string;
  order_id?: string;
  channel: string;
  direction: string;
  body: string;
  meta?: any;
  created_at: string;
}