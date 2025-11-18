import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service'; // Importamos el servicio principal
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule], // Importamos ConfigModule para usar ConfigService
  controllers: [WhatsappController],
  providers: [
    WhatsappService, // Añadimos el servicio principal
  ],
  exports: [WhatsappService], // Lo exportamos si es necesario
})
export class WhatsappModule {}