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

    // 5️⃣ Tokenize query for multi-word searches
    const queryTokens = query.split(/\s+/).filter((token) => token.length > 0);

    // 6️⃣ Try DB search (case-insensitive, partial matches for each token)
    let dbQuery = supabase.from('products').select('*');
    if (queryTokens.length > 0) {
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

    // 7️⃣ If no results → fuzzy + phonetic match in JS
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
      return queryTokens.some((queryToken) => {
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
      });
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
}