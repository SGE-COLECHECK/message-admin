import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'puppeteer';
import Redis from 'ioredis';
import { SessionManagerService } from './session-manager.service';

export interface QueueItem {
  id: string;
  sessionName: string;
  phoneNumber: string;
  message: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  retryCount: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly redisClient: Redis;
  private readonly processing = new Map<string, boolean>();
  private processingInterval: NodeJS.Timeout;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SessionManagerService))
    private readonly sessionManager: SessionManagerService,
  ) {
    this.redisClient = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.maxRetries = this.configService.get<number>('QUEUE_RETRY_ATTEMPTS', 3);
    this.retryDelay = this.configService.get<number>('QUEUE_RETRY_DELAY', 5000);

    this.redisClient.on('connect', () => {
      this.logger.log('✅ Conectado a Redis');
    });

    this.redisClient.on('error', (err) => {
      this.logger.error('❌ Error en Redis:', err);
    });
  }

  onModuleInit() {
    const interval = this.configService.get<number>('QUEUE_PROCESSING_INTERVAL', 1000);
    this.processingInterval = setInterval(() => this.processAllQueues(), interval);
    this.logger.log(`🔄 Procesamiento de colas iniciado (cada ${interval}ms)`);
  }

  async onModuleDestroy() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    await this.redisClient.quit();
    this.logger.log('🔌 Redis desconectado');
  }

  private getQueueKey(sessionName: string): string {
    return `queue:${sessionName}`;
  }

  async addToQueue(
    sessionName: string,
    phoneNumber: string,
    message: string
  ): Promise<string> {
    const id = `${sessionName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const item: QueueItem = {
      id,
      sessionName,
      phoneNumber,
      message,
      timestamp: new Date(),
      status: 'pending',
      retryCount: 0,
    };

    const queueKey = this.getQueueKey(sessionName);
    await this.redisClient.rpush(queueKey, JSON.stringify(item));
    
    this.logger.log(`📥 Mensaje agregado a cola '${sessionName}': ${id} (${phoneNumber})`);
    return id;
  }

  private async processAllQueues(): Promise<void> {
    try {
      const keys = await this.redisClient.keys('queue:*');
      
      for (const queueKey of keys) {
        const sessionName = queueKey.replace('queue:', '');
        
        if (this.processing.get(sessionName)) continue;
        
        const queueLength = await this.redisClient.llen(queueKey);
        if (queueLength === 0) continue;

        const itemStr = await this.redisClient.lindex(queueKey, 0);
        if (!itemStr) continue;

        const item: QueueItem = JSON.parse(itemStr);
        
        if (item.status !== 'pending') {
          if (item.status === 'completed' || item.status === 'failed') {
            await this.redisClient.lpop(queueKey);
          }
          continue;
        }

        this.processing.set(sessionName, true);
        item.status = 'processing';
        await this.redisClient.lset(queueKey, 0, JSON.stringify(item));

        try {
          await this.processSingleItem(item);
          
          item.status = 'completed';
          this.logger.log(`✅ Mensaje ${item.id} completado`);
          
          await this.redisClient.lpop(queueKey);
          await this.saveToHistory(item);
          
        } catch (error) {
          item.retryCount++;
          
          if (item.retryCount >= this.maxRetries) {
            item.status = 'failed';
            item.error = error.message;
            this.logger.error(`❌ Mensaje ${item.id} falló después de ${this.maxRetries} intentos: ${error.message}`);
            
            await this.redisClient.lpop(queueKey);
            await this.saveToErrors(item);
          } else {
            item.status = 'pending';
            this.logger.warn(`⚠️ Mensaje ${item.id} falló (intento ${item.retryCount}/${this.maxRetries}). Reintentando...`);
            
            await this.redisClient.lpop(queueKey);
            await this.redisClient.rpush(queueKey, JSON.stringify(item));
            await this.sleep(this.retryDelay);
          }
        } finally {
          this.processing.set(sessionName, false);
        }
      }
    } catch (error) {
      this.logger.error('Error en processAllQueues:', error);
    }
  }

  // ✅ AQUÍ está la integración con Puppeteer
  private async processSingleItem(item: QueueItem): Promise<void> {
    const session = this.sessionManager.get(item.sessionName);
    
    if (!session || !session.page) {
      throw new Error(`Sesión '${item.sessionName}' no encontrada o sin página activa`);
    }

    if (!session.isAuthenticated) {
      throw new Error(`Sesión '${item.sessionName}' no está autenticada`);
    }

    await this.sendMessageViaPuppeteer(session.page, item.phoneNumber, item.message);
  }

  // ✅ Lógica de envío con Puppeteer
  private async sendMessageViaPuppeteer(page: Page, phoneNumber: string, message: string): Promise<void> {
    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('51')) {
      formattedPhone = '51' + formattedPhone;
    }

    // Buscar contacto
    const searchBox = await page.$('div[contenteditable="true"][data-tab="3"]');
    if (!searchBox) throw new Error('No se encontró el cuadro de búsqueda.');
    
    await searchBox.click();
    await this.sleep(300);
    
    // Limpiar búsqueda anterior
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await this.sleep(200);
    
    // Escribir número
    await page.type('div[contenteditable="true"][data-tab="3"]', formattedPhone, { delay: 100 });
    await this.sleep(1500);
    await page.keyboard.press('Enter');
    await this.sleep(2000);

    // Escribir mensaje
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

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async saveToHistory(item: QueueItem): Promise<void> {
    const historyKey = `history:${item.sessionName}:${item.id}`;
    await this.redisClient.setex(historyKey, 86400, JSON.stringify(item));
  }

  private async saveToErrors(item: QueueItem): Promise<void> {
    const errorKey = `errors:${item.sessionName}:${item.id}`;
    await this.redisClient.setex(errorKey, 604800, JSON.stringify(item));
  }

  async getQueueStatus(sessionName: string): Promise<any> {
    const queueKey = this.getQueueKey(sessionName);
    const items = await this.redisClient.lrange(queueKey, 0, -1);
    
    const parsedItems: QueueItem[] = items.map(item => JSON.parse(item));
    
    // ✅ Calcular tiempo estimado (aprox 5-8 segundos por mensaje)
    const avgTimePerMessage = 6.5; // segundos
    const pendingCount = parsedItems.filter(i => i.status === 'pending').length;
    const estimatedTimeSeconds = pendingCount * avgTimePerMessage;
    const estimatedMinutes = Math.ceil(estimatedTimeSeconds / 60);
    
    return {
      sessionName,
      total: parsedItems.length,
      pending: pendingCount,
      processing: parsedItems.filter(i => i.status === 'processing').length,
      isProcessing: this.processing.get(sessionName) || false,
      estimatedTime: {
        seconds: Math.round(estimatedTimeSeconds),
        minutes: estimatedMinutes,
        formatted: estimatedMinutes < 1 ? 'Menos de 1 minuto' : `~${estimatedMinutes} min`
      },
      items: parsedItems.map(i => ({
        id: i.id,
        phoneNumber: i.phoneNumber,
        status: i.status,
        retryCount: i.retryCount,
        timestamp: i.timestamp
      }))
    };
  }

  async getAllQueuesStatus(): Promise<any[]> {
    const keys = await this.redisClient.keys('queue:*');
    const sessions = keys.map(key => key.replace('queue:', ''));
    
    const statuses = await Promise.all(
      sessions.map(sessionName => this.getQueueStatus(sessionName))
    );
    
    return statuses;
  }

  async clearQueue(sessionName: string): Promise<void> {
    const queueKey = this.getQueueKey(sessionName);
    await this.redisClient.del(queueKey);
    this.logger.log(`🧹 Cola '${sessionName}' limpiada`);
  }

  async getErrors(sessionName: string, limit: number = 50): Promise<QueueItem[]> {
    const errorKeys = await this.redisClient.keys(`errors:${sessionName}:*`);
    const errors = await Promise.all(
      errorKeys.slice(0, limit).map(async key => {
        const data = await this.redisClient.get(key);
        return data ? JSON.parse(data) : null;
      })
    );
    
    return errors.filter(e => e !== null);
  }
}