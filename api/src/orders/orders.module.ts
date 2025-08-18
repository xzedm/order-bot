import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductService } from '../products/product.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [OrderService, PrismaService, ProductService],
  exports: [OrderService],
})
export class OrdersModule {}