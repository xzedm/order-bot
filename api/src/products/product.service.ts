// src/product/product.service.ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';

@Injectable()
export class ProductService {
  products: any[] = [];

  constructor() {
    const filePath = path.join(__dirname, '../../data/products.csv');
    if (fs.existsSync(filePath)) {
      const results: any[] = [];
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          this.products = results;
          console.log(`[ProductService] Loaded ${this.products.length} products`);
        });
    } else {
      console.warn(`[ProductService] CSV file not found at: ${filePath}`);
    }
  }

  findByName(name: string) {
    if (!name) return [];
    const lower = name.toLowerCase();
    return this.products.filter((p) =>
      p.name.toLowerCase().includes(lower)
    );
  }

  searchInText(text: string) {
    if (!text) return [];
    const lower = text.toLowerCase();
    return this.products.filter((p) =>
      lower.includes(p.name.toLowerCase())
    );
  }
}
