import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'puppeteer';

interface QueueItem {
  id: string;
  sessionName: string;
  page: Page;
  phoneNumber: string;
  message: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<string, QueueItem[]>();
  private readonly processing = new Map<string, boolean>();

  constructor() {
    // Inicializar procesamiento de colas cada X tiempo
    setInterval(() => this.processAllQueues(), 1000);
  }

  async addToQueue(
    sessionName: string,
    page: Page,
    phoneNumber: string,
    message: string
  ): Promise<string> {
    const id = `${sessionName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const item: QueueItem = {
      id,
      sessionName,
      page,
      phoneNumber,
      message,
      timestamp: new Date(),
      status: 'pending'
    };

    if (!this.queues.has(sessionName)) {
      this.queues.set(sessionName, []);
    }

    this.queues.get(sessionName)!.push(item);
    this.logger.log(`📥 Mensaje agregado a la cola de '${sessionName}': ${id}`);

    return id;
  }

  private async processAllQueues(): Promise<void> {
    for (const [sessionName, queue] of this.queues.entries()) {
      // Si ya está procesando esta sesión, saltar
      if (this.processing.get(sessionName)) continue;

      // Buscar el primer item pendiente
      const pendingItem = queue.find(item => item.status === 'pending');
      if (!pendingItem) continue;

      // Marcar como procesando
      this.processing.set(sessionName, true);
      pendingItem.status = 'processing';

      try {
        await this.processSingleItem(pendingItem);
        pendingItem.status = 'completed';
        this.logger.log(`✅ Mensaje ${pendingItem.id} completado`);
      } catch (error) {
        pendingItem.status = 'failed';
        pendingItem.error = error.message;
        this.logger.error(`❌ Mensaje ${pendingItem.id} falló: ${error.message}`);
      } finally {
        this.processing.set(sessionName, false);
        
        // Limpiar items completados/fallidos después de 5 minutos
        setTimeout(() => {
          const index = queue.findIndex(item => item.id === pendingItem.id);
          if (index !== -1) queue.splice(index, 1);
        }, 300000);
      }
    }
  }

  private async processSingleItem(item: QueueItem): Promise<void> {
    const { page, phoneNumber, message } = item;
    
    // Aquí va la lógica de envío de mensaje
    // (lo movemos desde ScraperService)
    await this.sendMessage(page, phoneNumber, message);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async sendMessage(page: Page, phoneNumber: string, message: string): Promise<void> {
    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('51')) formattedPhone = '51' + formattedPhone;

    const searchBox = await page.$('div[contenteditable="true"][data-tab="3"]');
    if (!searchBox) throw new Error('No se encontró el cuadro de búsqueda.');
    
    await searchBox.click();
    await this.sleep(300);
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await this.sleep(200);
    
    await page.type('div[contenteditable="true"][data-tab="3"]', formattedPhone, { delay: 100 });
    await this.sleep(1500);
    await page.keyboard.press('Enter');
    await this.sleep(2000);

    await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 10000 });
    const messageBox = await page.$('div[contenteditable="true"][data-tab="10"]');
    if (!messageBox) throw new Error('No se encontró el cuadro de mensaje.');
    
    await messageBox.click();
    await this.sleep(300);

    const lines = message.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.length > 0) {
        await page.type('div[contenteditable="true"][data-tab="10"]', line, { delay: 20 });
      }
      
      if (i < lines.length - 1) {
        await page.keyboard.down('Shift');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Shift');
        await this.sleep(50);
      }
    }

    await this.sleep(300);
    await page.keyboard.press('Enter');
    await this.sleep(1500);
  }

  getQueueStatus(sessionName: string): any {
    const queue = this.queues.get(sessionName) || [];
    
    return {
      sessionName,
      total: queue.length,
      pending: queue.filter(i => i.status === 'pending').length,
      processing: queue.filter(i => i.status === 'processing').length,
      completed: queue.filter(i => i.status === 'completed').length,
      failed: queue.filter(i => i.status === 'failed').length,
      isProcessing: this.processing.get(sessionName) || false
    };
  }

  getAllQueuesStatus(): any[] {
    return Array.from(this.queues.keys()).map(sessionName => 
      this.getQueueStatus(sessionName)
    );
  }
}