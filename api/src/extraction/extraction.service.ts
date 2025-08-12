import Ajv from 'ajv';
import schema from './schema/order.schema.json';

export type ExtractResult = {
  intent: 'place_order' | 'check_status' | 'unknown';
  items?: { sku?: string; name: string; qty: number }[];
  customer?: { name?: string; phone?: string };
  confidence: number;
};

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema as any);

// Простейшее извлечение: паттерны "<кол-во> <название>"
export class ExtractionService {
  async extract(text: string): Promise<ExtractResult> {
    const statusCmd = text.trim().toLowerCase().startsWith('/status ')
      ? 'check_status'
      : null;

    if (statusCmd) {
      const res: ExtractResult = { intent: 'check_status', confidence: 1.0 };
      return res;
    }

    const re = /(\d+)\s+([\p{L}\d\- ]+?)(?:[,.]|$)/giu;
    const items: { name: string; qty: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const qty = parseInt(m[1], 10);
      const name = m[2].trim();
      if (!Number.isNaN(qty) && name) items.push({ name, qty });
    }

    const result: ExtractResult = {
      intent: items.length ? 'place_order' : 'unknown',
      items,
      confidence: items.length ? 0.7 : 0.3,
    };

    if (!validate(result as any)) return { intent: 'unknown', confidence: 0.0 };
    return result;
  }
}
