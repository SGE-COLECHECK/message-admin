import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAccount } from 'whatsapp-accounts.config';

@Injectable()
export class WhatsappAccountManager implements OnModuleInit {
  private readonly logger = new Logger(WhatsappAccountManager.name);
  private accounts: Map<string, WhatsappService> = new Map();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const accountConfigs = this.configService.get<WhatsappAccount[]>('whatsappAccounts');
    const browserHost = this.configService.get<string>('PUPPETEER_BROWSER_HOST');

    if (!browserHost) {
      this.logger.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      this.logger.error('!!! ERROR: PUPPETEER_BROWSER_HOST no está definido en el archivo .env !!!');
      this.logger.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      return;
    }

    this.logger.log(`Inicializando ${accountConfigs.length} cuenta(s) de WhatsApp...`);
    this.logger.log(`Usando host del navegador: ${browserHost}`);

    for (const config of accountConfigs) {
      this.logger.log(`- Configurando cuenta: ${config.description} (ID: ${config.id})`);
      // Pasamos el ConfigService global, no uno falso.
      const service = new WhatsappService(this.configService, config.id, config.description);
      // Inicializamos el servicio pasándole los datos necesarios.
      await service.initialize(config.debuggingPort, browserHost);
      this.accounts.set(config.id, service);
    }
  }

  getAccount(accountId: string): WhatsappService | undefined {
    return this.accounts.get(accountId);
  }
}