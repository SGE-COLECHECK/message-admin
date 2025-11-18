import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { ConfigModule } from '@nestjs/config';
import { WhatsappAccountManager } from './whatsapp-account.manager';

@Module({
  imports: [ConfigModule], // Importamos ConfigModule para usar ConfigService
  controllers: [WhatsappController],
  providers: [
    WhatsappAccountManager, // El manager se encargará de crear los servicios
  ],
  exports: [WhatsappAccountManager],
})
export class WhatsappModule {}