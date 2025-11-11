import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'puppeteer';
import Redis from 'ioredis';
import { SessionManagerService } from './session-manager.service';
// Asegúrate de importar tu StatsService
import { StatsService } from './stats.service';

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

  // ✅ NUEVAS PROPIEDADES CONFIGURABLES
  private readonly typingDelay: number;
  private readonly afterClickDelay: number;
  private readonly uiTimeout: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SessionManagerService))
    private readonly sessionManager: SessionManagerService,
    // ✅ INYECTAMOS EL STATS SERVICE
    private readonly statsService: StatsService,
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

    // ✅ CARGAMOS LOS VALORES DESDE LAS VARIABLES DE ENTORNO
    this.typingDelay = this.configService.get<number>('PUPPETEER_TYPING_DELAY', 50);
    this.afterClickDelay = this.configService.get<number>('PUPPETEER_AFTER_CLICK_DELAY', 150);
    this.uiTimeout = this.configService.get<number>('PUPPETEER_WAIT_FOR_UI_TIMEOUT', 5000);

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

          // ✅ INTEGRACIÓN CON STATS SERVICE
          await this.statsService.incrementDailyCounter(item.sessionName);

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

  private async sendMessageViaPuppeteer(page: Page, phoneNumber: string, message: string): Promise<void> {
    console.log("********************");
    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('51')) {
      formattedPhone = '51' + formattedPhone;
    }

    try {
      // --- PASO 1: ENCONTRAR Y HACER CLIC EN EL CUADRO DE BÚSQUEDA ---
      this.logger.log(`[PASO 1] Buscando el cuadro de búsqueda...`);
      const searchBox = await page.waitForSelector('div[contenteditable="true"][data-tab="3"]', { timeout: this.uiTimeout });
      if (!searchBox) throw new Error('No se encontró el cuadro de búsqueda.');

      await searchBox.click();
      await this.sleep(this.afterClickDelay);

      // --- PASO 2: LIMPIAR EL CUADRO DE BÚSQUEDA (FORMA ROBUSTA) ---
      this.logger.log(`[PASO 2] Limpiando el cuadro de búsqueda con Ctrl+A y Backspace...`);
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await this.sleep(200); // Pequeña pausa para que el texto se seleccione
      await page.keyboard.press('Backspace');
      await this.sleep(this.afterClickDelay);
      this.logger.log(`[PASO 2] Cuadro de búsqueda limpio.`);

      // --- PASO 3: ESCRIBIR EL NÚMERO DE TELÉFONO ---
      this.logger.log(`[PASO 3] Escribiendo el número de teléfono: ${formattedPhone}`);
      await page.type('div[contenteditable="true"][data-tab="3"]', formattedPhone, { delay: this.typingDelay });
      await this.sleep(1500); // Esperar a que la lista de contactos se actualice

      // --- PASO 4: SELECCIONAR EL PRIMER CONTACTO DE LA LISTA ---
      this.logger.log(`[PASO 4] Esperando a que el contacto aparezca en la lista...`);
      await page.waitForFunction(() => {
        const contact = document.querySelector('._2auQ3') as HTMLElement;
        return contact && contact.offsetParent !== null;
      }, { timeout: this.uiTimeout });
      this.logger.log(`[PASO 4] Contacto encontrado. Presionando 'Enter'...`);
      await page.keyboard.press('Enter');
      await this.sleep(2000); // Esperar a que el chat se cargue

      // --- PASO 5: ENCONTRAR Y HACER CLIC EN EL CUADRO DE MENSAJE ---
      this.logger.log(`[PASO 5] Buscando el cuadro de mensaje...`);
      const messageBox = await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: this.uiTimeout });
      if (!messageBox) throw new Error('No se encontró el cuadro de mensaje.');

      await messageBox.click();
      await this.sleep(this.afterClickDelay);

      // --- PASO 6: ESCRIBIR EL MENSAJE ---
      this.logger.log(`[PASO 6] Escribiendo el mensaje: "${message}"`);
      await page.keyboard.type(message, { delay: this.typingDelay });
      await this.sleep(this.afterClickDelay);

      // --- PASO 7: ENVIAR EL MENSAJE ---
      this.logger.log(`[PASO 7] Enviando el mensaje...`);
      await page.keyboard.press('Enter');
      await this.sleep(1500);

      // --- PASO 8: CONFIRMAR QUE SE ENVÍO ---
      this.logger.log(`[PASO 8] Esperando confirmación de envío (check mark)...`);
      await page.waitForFunction(() => {
        const messageStatus = document.querySelector('[data-icon="msg-check"]') as HTMLElement;
        return messageStatus && messageStatus.offsetParent !== null;
      }, { timeout: this.uiTimeout });
      this.logger.log(`[PASO 8] ✅ Mensaje enviado con éxito.`);

    } catch (error) {
      this.logger.error(`❌ Error al enviar mensaje a ${formattedPhone}: ${error.message}`);

      // 📸 CAPTURA DE PANTALLA EN CASO DE ERROR (CON CORRECCIÓN)
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const screenshotPath = `error-${formattedPhone}-${timestamp}.png`;

      // --- CORRECCIÓN AQUÍ ---
      await page.screenshot({ path: screenshotPath as `${string}.png`, fullPage: true });
      this.logger.error(`📸 Captura de pantalla guardada en: ${screenshotPath}`);
      throw error;
    }
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

    // Calcular tiempo estimado (aprox 5-8 segundos por mensaje)
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