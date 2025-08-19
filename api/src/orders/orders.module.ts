import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { ProductService } from '../products/product.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersController } from './orders.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [OrdersController],
  providers: [OrderService, ProductService],
  exports: [OrderService],
})
export class OrdersModule {}