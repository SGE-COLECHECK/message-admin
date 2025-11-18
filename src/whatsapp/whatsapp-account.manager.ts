import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAccount } from './config/whatsapp-accounts.config';

@Injectable()
export class WhatsappAccountManager implements OnModuleInit {
  private readonly logger = new Logger(WhatsappAccountManager.name);
  private accounts: Map<string, WhatsappService> = new Map();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const accountConfigs = this.configService.get<WhatsappAccount[]>('whatsappAccounts', []);
    this.logger.log(`Inicializando ${accountConfigs.length} cuenta(s) de WhatsApp...`);

    for (const config of accountConfigs) {
      this.logger.log(`- Configurando cuenta: ${config.description} (ID: ${config.id})`);
      // Creamos una instancia de ConfigService "falsa" para cada cuenta,
      // para que cada WhatsappService tenga su propia configuración.
      const accountConfigService = {
        get: (key: string) => {
          if (key === 'WHATSAPP_DEBUG_PORT') return config.debuggingPort;
          if (key === 'WHATSAPP_PROFILE_PATH') return config.profilePath;
          return this.configService.get(key); // Para el resto de las variables, usa la global
        },
      } as ConfigService;

      const service = new WhatsappService(accountConfigService, config.id);
      this.accounts.set(config.id, service);
      await service.onModuleInit(); // Conectamos cada servicio
    }
  }

  getAccount(accountId: string): WhatsappService | undefined {
    return this.accounts.get(accountId);
  }
}