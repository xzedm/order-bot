import { Injectable } from '@nestjs/common';
import { supabase } from '../config/supabase';

export interface Product {
  id: string;
  name: string;
  price: number;
  sku: string; // Assuming 'article number' is 'sku';
  url?: string;
}

@Injectable()
export class ProductService {
  async findByName(name: string): Promise<Product[]> {
    console.log('[ProductService] Searching for:', name);

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .ilike('name', `%${name}%`);

    if (error) {
      console.error('[ProductService] Error fetching by name:', error.message);
      return [];
    }

    console.log('[ProductService] Found products:', data);
    return data || [];
  }

  // Removed searchInText since we're extracting names properly now
}