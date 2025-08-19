import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ManagerNotificationService } from './manager-notification.service';

@Module({
  imports: [TelegrafModule],
  providers: [ManagerNotificationService],
  exports: [ManagerNotificationService],
})
export class NotificationsModule {}