import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsappAccountManager } from './whatsapp-account.manager';
import Redis from 'ioredis';

@Module({
  imports: [ConfigModule], // Importamos ConfigModule para usar ConfigService
  controllers: [WhatsappController],
  providers: [
    WhatsappAccountManager, // El manager se encargará de crear los servicios
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [WhatsappAccountManager, 'REDIS_CLIENT'],
})
export class WhatsappModule { }