import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = [
    { sku: 'ARDUINO-UNO', name: 'Arduino Uno R3', price: 5500, currency: 'KZT', stockQty: 25 },
    { sku: 'RPI4-4GB', name: 'Raspberry Pi 4 4GB', price: 45000, currency: 'KZT', stockQty: 8 },
    { sku: 'RPI4-8GB', name: 'Raspberry Pi 4 8GB', price: 60000, currency: 'KZT', stockQty: 4 }
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: p,
      create: p
    });
  }
  console.log('Seeded products:', products.length);
}

main().finally(() => prisma.$disconnect());
