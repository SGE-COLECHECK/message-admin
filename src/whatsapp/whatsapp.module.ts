import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { BrowserService } from './services/browser.service';
import { AuthService } from './services/auth.service';
import { ScraperService } from './services/scraper.service';
import { SessionManagerService } from './services/session-manager.service';
import { QueueService } from './services/queue.service';

@Module({
  controllers: [WhatsappController],
  providers: [
    BrowserService,
    AuthService,
    ScraperService,
    SessionManagerService,
    QueueService,
  ],
})
export class WhatsappModule {}