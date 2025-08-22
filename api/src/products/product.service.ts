import { Injectable } from '@nestjs/common';
import { supabase } from '../config/supabase';
import { transliterate as tr } from 'transliteration';
import natural from 'natural';
import { synonyms, normalizeWithSynonyms } from '../utils/synonyms';

const { DoubleMetaphone, JaroWinklerDistance, LevenshteinDistance } = natural;

export interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  url?: string;
  qty: number;
}

@Injectable()
export class ProductService {
  async findByName(name: string): Promise<Product[]> {
    console.log('[ProductService] Searching for:', name);

    // 1️⃣ Normalize text
    let query = name.toLowerCase().trim();

    // 2️⃣ Transliterate (optimized for Russian or other scripts)
    query = tr(query, { unknown: '?' }); // Preserve unknown characters as '?'
    
    // 3️⃣ Normalize common transliteration variations
    query = this.normalizeTransliteration(query);

    // 4️⃣ Apply synonyms mapping
    query = normalizeWithSynonyms(query);

    // 5️⃣ Try to extract full SKU token first (e.g., REV-41-1305-PK8)
    const extractedSku = this.extractSkuFromText(name);
    if (extractedSku) {
      const bySku = await this.findBySku(extractedSku);
      if (bySku) {
        return [bySku];
      }
    }

    // 6️⃣ Try to normalize potential product code like "rev-41" or "рев-41"
    const normalizedCode = this.normalizeProductCode(query);

    // 7️⃣ Tokenize query for multi-word searches
    const queryTokens = query.split(/\s+/).filter((token) => token.length > 0);

    // 8️⃣ Try DB search (case-insensitive). Prefer SKU prefix/name match for product codes
    let dbQuery = supabase.from('products').select('*');

    if (normalizedCode) {
      // Search by SKU prefix and also name containing the code
      const code = normalizedCode; // already uppercased
      dbQuery = dbQuery.or([
        `sku.ilike.${code}%`,
        `name.ilike.%${code}%`
      ].join(','));
    } else if (queryTokens.length > 0) {
      dbQuery = dbQuery.or(
        queryTokens
          .map((token) => `name.ilike.%${token}%`)
          .join(',')
      );
    } else {
      dbQuery = dbQuery.ilike('name', `%${query}%`);
    }

    const { data, error } = await dbQuery;

    if (error) {
      console.error('[ProductService] Error fetching by name:', error.message);
      return [];
    }

    // ✅ Return early if we found matches
    if (data?.length) {
      console.log('[ProductService] Found products (direct search):', data);
      return data;
    }

    // 9️⃣ If no results → fuzzy + phonetic match in JS (also try SKU contains for tokens)
    const { data: allProducts } = await supabase.from('products').select('*');

    if (!allProducts) return [];

    // ✅ Create an instance of DoubleMetaphone
    const phonetic = new DoubleMetaphone();

    const fuzzyMatches = allProducts.filter((p) => {
      const productName = p.name.toLowerCase();
      const transliteratedProductName = tr(productName); // Transliterate product name too
      const normalizedProductName = this.normalizeTransliteration(transliteratedProductName);
      const productPhonetic = phonetic.process(normalizedProductName)[0];

      // ✅ Tokenize product name for multi-word matching
      const productTokens = normalizedProductName.split(/\s+/);

      // ✅ Check each query token against product tokens
      const tokensToCheck = queryTokens.length ? queryTokens : [query];
      return tokensToCheck.some((queryToken) => {
        const queryPhonetic = phonetic.process(queryToken)[0];

        return productTokens.some((productToken) => {
          // ✅ Use both Jaro-Winkler and Levenshtein for fuzzy matching
          const jwScore = JaroWinklerDistance(queryToken, productToken);
          const lvDistance = LevenshteinDistance(queryToken, productToken);
          const maxLength = Math.max(queryToken.length, productToken.length);
          const lvScore = maxLength > 0 ? 1 - lvDistance / maxLength : 0;

          // ✅ Loosened thresholds for transliterated inputs
          return (
            jwScore > 0.7 || // Lowered threshold for more matches
            lvScore > 0.65 || // Allow small edit distances
            queryPhonetic === phonetic.process(productToken)[0]
          );
        });
      }) || (normalizedCode ? (
        (p.sku && typeof p.sku === 'string' && p.sku.toUpperCase().startsWith(normalizedCode)) ||
        (p.name && typeof p.name === 'string' && p.name.toUpperCase().includes(normalizedCode))
      ) : false);
    });

    if (fuzzyMatches.length) {
      console.log('[ProductService] Found fuzzy/phonetic matches:', fuzzyMatches);
      return fuzzyMatches;
    }

    console.log('[ProductService] No matches found.');
    return [];
  }

  // ✅ Helper to normalize common transliteration variations
  private normalizeTransliteration(text: string): string {
    const transliterationMap: { [key: string]: string } = {
      zh: 'j',
      sh: 's',
      ch: 'c',
      ts: 'c',
      ya: 'ia',
      yu: 'iu',
      ye: 'e',
      yo: 'o',
    };

    let normalized = text;
    for (const [from, to] of Object.entries(transliterationMap)) {
      normalized = normalized.replace(new RegExp(from, 'g'), to);
    }
    return normalized;
  }

  // ✅ Normalize product codes like "рев-41" → "REV-41" and "rev41" → "REV-41"
  private normalizeProductCode(text: string): string | null {
    let t = text.trim().toLowerCase();
    // Replace Cyrillic 'рев' with 'rev'
    t = t.replace(/^\s*рев/gi, 'rev');
    // Allow spaces or missing hyphen between prefix and digits
    const m = t.match(/\b([a-z]{2,6})[\s-]?(\d{2,4})\b/);
    if (!m) return null;
    const prefix = m[1];
    const digits = m[2];
    // Only treat well-known hardware prefixes like rev, arduino codes etc. For now focus on REV
    if (['rev'].includes(prefix)) {
      return `${prefix.toUpperCase()}-${digits}`;
    }
    return null;
  }

  // ✅ Try to extract a concrete SKU token from free text
  private extractSkuFromText(text: string): string | null {
    if (!text) return null;
    const m = text.match(/[A-Z]{2,6}-\d{2,4}(?:-[A-Z0-9]{2,10})+/i);
    return m ? m[0].toUpperCase() : null;
  }

  // ✅ Find product by exact SKU
  async findBySku(sku: string): Promise<Product | null> {
    const { data, error } = await supabase.from('products').select('*').eq('sku', sku.toUpperCase()).maybeSingle();
    if (error) {
      console.error('[ProductService] Error fetching by SKU:', error.message);
      return null;
    }
    return (data as any) || null;
  }
}