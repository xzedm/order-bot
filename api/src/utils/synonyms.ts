export const synonyms: Record<string, string[]> = {
  battery: ['batareya', 'батарея', 'аккумулятор', 'battery pack'],
  charger: ['зарядка', 'adapter', 'питание', 'charging device'],
  motor: ['мотор', 'двигатель', 'engine', 'motor unit'],
  rev: ['рев'],
};


export function normalizeWithSynonyms(word: string) {
  const lower = word.toLowerCase();
  for (const [key, values] of Object.entries(synonyms)) {
    if (values.includes(lower)) {
      return key; // Use the standard term
    }
  }
  return lower; // No match, return as is
}
