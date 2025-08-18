import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ManagerNotificationService } from './manager-notification.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [TelegrafModule],
  providers: [ManagerNotificationService, PrismaService],
  exports: [ManagerNotificationService],
})
export class NotificationsModule {}