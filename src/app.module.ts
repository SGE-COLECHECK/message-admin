import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ConfigModule } from '@nestjs/config';
import whatsappAccountsConfig from 'whatsapp-accounts.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que ConfigModule esté disponible globalmente
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`, // ¡CRÍTICO! Carga el archivo .env correcto.
      load: [whatsappAccountsConfig], // Carga la configuración de las cuentas
    }),
    WhatsappModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}