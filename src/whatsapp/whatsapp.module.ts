import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { SessionManagerService } from './services/session-manager.service';
import { BrowserService } from './services/browser.service';
import { AuthService } from './services/auth.service';
import { ScraperService } from './services/scraper.service';

@Module({
  controllers: [WhatsappController],
  providers: [
    SessionManagerService,
    BrowserService,
    AuthService,
    ScraperService,
  ],
})
export class WhatsappModule {}