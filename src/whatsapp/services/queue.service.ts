import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import { Page } from 'puppeteer';
import Redis from 'ioredis';
import { SessionManagerService } from './session-manager.service';
import { BrowserService } from './browser.service';
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
    private readonly sessionManager: SessionManagerService,
    // ✅ INYECTAMOS EL STATS SERVICE
    private readonly statsService: StatsService,
    private readonly browserService: BrowserService,
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
    // Iniciar inmediatamente
    const interval = this.configService.get<number>('QUEUE_PROCESSING_INTERVAL', 1000);
    this.processingInterval = setInterval(() => this.processAllQueues(), interval);
    this.logger.log(`🔄 Procesamiento de colas iniciado (cada ${interval}ms)`);
    this.logger.log(`📊 Configuración: Typing=${this.typingDelay}ms, AfterClick=${this.afterClickDelay}ms, UITimeout=${this.uiTimeout}ms`);
    
    // Diagnosticar conexión a Redis (sin esperar, para no bloquear)
    this.diagnosisRedisConnection().catch(err => {
      this.logger.error('Error en diagnóstico de Redis:', err);
    });
  }

  async onModuleDestroy() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    await this.redisClient.quit();
    this.logger.log('🔌 Redis desconectado');
  }

  private async diagnosisRedisConnection(): Promise<void> {
    try {
      const pong = await this.redisClient.ping();
      this.logger.log(`✅ Conexión a Redis confirmada: ${pong}`);
      
      // Verificar si hay colas pendientes
  const keys = await this.redisClient.keys('whatsapp-queue:*');
      this.logger.log(`📋 Colas existentes en Redis: ${keys.length} sesión(es)`);
      
      for (const key of keys) {
        const length = await this.redisClient.llen(key);
        this.logger.log(`   - ${key}: ${length} mensaje(s)`);
      }
    } catch (error) {
      this.logger.error(`❌ No se pudo conectar a Redis: ${error.message}`);
      this.logger.error(`   Redis Host: ${this.configService.get<string>('REDIS_HOST')}`);
      this.logger.error(`   Redis Port: ${this.configService.get<number>('REDIS_PORT')}`);
    }
  }

  private getQueueKey(sessionName: string): string {
    return `whatsapp-queue:${sessionName}`;
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
    
    try {
      await this.redisClient.rpush(queueKey, JSON.stringify(item));
      this.logger.log(`📥 [QUEUE] Mensaje agregado a cola '${sessionName}': ${id} (${phoneNumber})`);
      this.logger.log(`   └─ Mensaje: "${message.substring(0, 50)}..."`);
      return id;
    } catch (error) {
      this.logger.error(`❌ [QUEUE] Error al agregar mensaje a Redis: ${error.message}`);
      this.logger.error(`   └─ Queue Key: ${queueKey}`);
      this.logger.error(`   └─ Session: ${sessionName}`);
      throw error;
    }
  }

  private async processAllQueues(): Promise<void> {
    try {
  const keys = await this.redisClient.keys('whatsapp-queue:*');

      if (keys.length === 0) {
        return; // Sin colas, no hacer nada
      }

      for (const queueKey of keys) {
          const sessionName = queueKey.replace('whatsapp-queue:', '');

        // ✅ VERIFICACIÓN: ¿La sesión existe?
        const session = this.sessionManager.get(sessionName);
        if (!session) {
          this.logger.warn(`⚠️  [QUEUE] Sesión '${sessionName}' no existe en memoria. Limpiando cola...`);
          
          // Limpiar la cola de Redis para esta sesión
          const queueLength = await this.redisClient.llen(queueKey);
          this.logger.warn(`   └─ Deletando ${queueLength} mensaje(s) huérfano(s)`);
          
          await this.redisClient.del(queueKey);
          continue;
        }

        if (this.processing.get(sessionName)) {
          this.logger.log(`⏸️  [QUEUE] Sesión '${sessionName}' ya está procesando, saltando...`);
          continue;
        }

        try {
          const queueLength = await this.redisClient.llen(queueKey);
          if (queueLength === 0) {
            continue;
          }

          const itemStr = await this.redisClient.lindex(queueKey, 0);
          if (!itemStr) {
            continue;
          }

          let item: QueueItem;
          try {
            item = JSON.parse(itemStr);
          } catch (parseError) {
            this.logger.error(`❌ [QUEUE] Error al parsear item JSON de ${sessionName}: ${parseError.message}`);
            // Eliminar item corrupto
            await this.redisClient.lpop(queueKey);
            continue;
          }

          if (item.status !== 'pending') {
            if (item.status === 'completed' || item.status === 'failed') {
              await this.redisClient.lpop(queueKey);
            }
            continue;
          }

          this.processing.set(sessionName, true);
          item.status = 'processing';
          await this.redisClient.lset(queueKey, 0, JSON.stringify(item));

          this.logger.log(`⚙️  [QUEUE] Procesando: ${item.id} (${item.phoneNumber})`);

          try {
            // ⏱️ Timeout de seguridad: si processSingleItem toma > 60 segundos, cancelar
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Procesamiento de item excedió 60 segundos')), 60000)
            );
            await Promise.race([this.processSingleItem(item), timeoutPromise]);

            item.status = 'completed';

            // 📊 TIMING: Calcular tiempo total desde enqueue hasta completado
            const itemTimestamp = item.timestamp instanceof Date 
              ? item.timestamp.getTime() 
              : new Date(item.timestamp).getTime();
            const totalTime = Date.now() - itemTimestamp;

            this.logger.log(`✅ [QUEUE] Completado: ${item.id}`);
            this.logger.log(`⏱️  [TIMING] Tiempo total (enqueue → envío): ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);

            await this.redisClient.lpop(queueKey);
            await this.saveToHistory(item);

            // ✅ INTEGRACIÓN CON STATS SERVICE
            await this.statsService.incrementDailyCounter(item.sessionName);

          } catch (error) {
            // Fire-and-forget: NO reintentos. Marcar como failed y mover a errores.
            item.status = 'failed';
            item.error = error?.message || String(error);
            this.logger.error(`❌ [QUEUE] Error procesando item ${item.id}: ${item.error}`);
            await this.redisClient.lpop(queueKey);
            await this.saveToErrors(item);
          } finally {
            this.processing.set(sessionName, false);
          }
        } catch (queueError) {
          this.logger.error(`❌ [QUEUE] Error procesando cola '${sessionName}': ${queueError.message}`);
          this.logger.error(`   └─ Stack: ${queueError.stack}`);
        }
      }
    } catch (error) {
      this.logger.error('❌ [QUEUE] Error crítico en processAllQueues:', error);
    }
  }

  // ✅ AQUÍ está la integración con Puppeteer
  private async processSingleItem(item: QueueItem): Promise<void> {
    const sessionName = item.sessionName;
    this.logger.log(`📱 [PUPPETEER] Iniciando envío para ${item.phoneNumber} en sesión '${sessionName}'`);

    try {
      // Get the browser permanently assigned to this session
      const browserData = this.browserService.getPoolBrowserForSession(sessionName);
      if (!browserData) {
        throw new Error(`No browser assigned to session '${sessionName}'. Session must be created first.`);
      }
      const { browser, poolId } = browserData;
      this.logger.log(`🖥️ [PUPPETEER] Usando Pool Navegador #${poolId} para sesión '${sessionName}'`);

      // Prefer reusing the in-memory Page object that was created during auth.
      // Reusing the same page avoids opening a new tab which triggers
      // WhatsApp's "use here" detection when multiple tabs are active.
      const memorySession = this.sessionManager.get(sessionName);
      if (memorySession && memorySession.isAuthenticated && memorySession.page) {
        this.logger.log(`🔁 [QUEUE] Reutilizando la página existente para sesión '${sessionName}' (Pool #${poolId})`);
        await this.sendMessageViaPuppeteer(memorySession.page, item.phoneNumber, item.message);
        return;
      }

      let context: any = null;
      let page: Page | null = null;

      try {
        // Some puppeteer/browser builds (or wrappers) might not expose
        // createIncognitoBrowserContext. Try to use it, otherwise
        // fall back to opening a new page on the browser instance.
        try {
          if (typeof (browser as any).createIncognitoBrowserContext === 'function') {
            context = await (browser as any).createIncognitoBrowserContext();
          } else {
            this.logger.warn('⚠️ [PUPPETEER] createIncognitoBrowserContext no disponible en este browser, usando newPage() como fallback');
          }
        } catch (err) {
          this.logger.warn('⚠️ [PUPPETEER] Falló createIncognitoBrowserContext, fallback a newPage(): ' + (err?.message || err));
        }

        const cookies = await this.sessionManager.loadSession(sessionName);

        // BACKWARD COMPAT: Si no hay cookies en disco, intentar usar la sesión en memoria
        if (!cookies || cookies.length === 0) {
          if (memorySession && memorySession.isAuthenticated && memorySession.page) {
            this.logger.log(`🔄 [QUEUE] Usando sesión en memoria para '${sessionName}' (no hay cookies en disco)`);
            await this.sendMessageViaPuppeteer(memorySession.page, item.phoneNumber, item.message);
            return;
          }
          throw new Error(`No session cookies for '${sessionName}'. Login required.`);
        }

        if (context) {
          page = await context.newPage();
        } else {
          // Fallback: create a page directly on the pooled browser
          page = await (browser as any).newPage();
        }
        const pg = page as Page;

        // Lightweight page configuration to reduce memory and speed-up
        try {
          await pg.setUserAgent(
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          );
          // ⏱️ IMPORTANTE: WhatsApp Web necesita más tiempo
          // this.uiTimeout (5000ms) es muy corto; usar 30 segundos para navegación
          const navigationTimeout = 30000; // 30 segundos para cargar WhatsApp Web
          await pg.setDefaultTimeout(navigationTimeout);
          await pg.setDefaultNavigationTimeout(navigationTimeout);
          await pg.setRequestInterception(true);
          pg.on('request', (req) => {
            if (['image', 'media'].includes(req.resourceType())) {
              req.abort();
            } else {
              req.continue();
            }
          });
        } catch (err) {
          // ignore page configure errors
        }

        // Set cookies before navigating
        try {
          await pg.setCookie(...cookies);
          this.logger.log(`🍪 [PUPPETEER] Cookies establecidas (${cookies.length})`);
        } catch (err) {
          this.logger.warn(`No se pudieron setear cookies directamente: ${err?.message || err}`);
        }

        // Navegar a WhatsApp Web y ejecutar la lógica existente
        this.logger.log(`📱 [PUPPETEER] Navegando a https://web.whatsapp.com...`);
        try {
          await pg.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (err) {
          // Si falla networkidle2, intentar con domcontentloaded (menos estricto)
          this.logger.warn(`⚠️ [PUPPETEER] networkidle2 falló, reintentando con domcontentloaded: ${err?.message || err}`);
          await pg.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        
        await this.sleep(3000); // Esperar a que cargue completamente
        this.logger.log(`📱 [PUPPETEER] Página lista, enviando mensaje...`);
        await this.sendMessageViaPuppeteer(pg, item.phoneNumber, item.message);
      } finally {
        try {
          if (page) await page.close();
        } catch (e) { /* ignore */ }
        try {
          if (context) await context.close();
        } catch (e) { /* ignore */ }
      }
    } catch (error) {
      this.logger.error(`❌ [QUEUE] Error en procesamiento: ${error.message}`);
      throw error;
    }
  }

private async sendMessageViaPuppeteer(page: Page, phoneNumber: string, message: string): Promise<void> {
    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('51')) {
      formattedPhone = '51' + formattedPhone;
    }

     if (formattedPhone === '51963828458') {
      this.logger.warn(`⚠️ Número de prueba detectado (${formattedPhone}). Ignorando y continuando.`);
      return;
    }

    try {
      // 🔍 DEBUG: verificar estado de la página antes de enviar
      const pageInfo = await page.evaluate(() => ({
        title: document.title,
        url: window.location.href,
        hasSearchBox: !!document.querySelector('div[contenteditable="true"][data-tab="3"]'),
        bodyText: document.body.innerText.substring(0, 200),
      }));
      this.logger.log(`📄 [DEBUG] Estado de página: ${JSON.stringify(pageInfo)}`);
    } catch (e) {
      this.logger.warn(`⚠️ Error obteniendo info de página: ${e?.message}`);
    }

    try {
      // --- PASO 1: ENCONTRAR Y LIMPIAR EL CUADRO DE BÚSQUEDA ---
      this.logger.log(`[PASO 1] Buscando y limpiando el cuadro de búsqueda...`);
      const searchBox = await page.waitForSelector('div[contenteditable="true"][data-tab="3"]', { timeout: this.uiTimeout });
      if (!searchBox) throw new Error('No se encontró el cuadro de búsqueda.');

      await searchBox.click();
      await this.sleep(this.afterClickDelay);

      // Triple clic es más rápido y fiable que Ctrl+A
      await searchBox.click({ clickCount: 3 });
      await this.sleep(50);
      await page.keyboard.press('Backspace');
      this.logger.log(`[PASO 1] ✅ Cuadro de búsqueda limpio.`);

      // --- PASO 2: ESCRIBIR EL NÚMERO Y PRESIONAR ENTER ---
      this.logger.log(`[PASO 2] Escribiendo el número y presionando Enter: ${formattedPhone}`);
      await page.type('div[contenteditable="true"][data-tab="3"]', formattedPhone, { delay: this.typingDelay });
      await page.keyboard.press('Enter'); // Enter para abrir el chat

      // --- PASO 3: ESPERAR Y VERIFICAR QUÉ PASÓ ---
      this.logger.log(`[PASO 3] Verificando si se abrió el chat...`);
      
      // Esperamos un momento a que la interfaz cambie
      await this.sleep(1500);

      // Verificamos si apareció el mensaje de "no encontrado" o "invitar"
      const noWhatsAppFound = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('No se encontró ningún chat, contacto ni mensaje') ||
               text.includes('No se encontraron') || 
               text.includes('Este número no está registrado en WhatsApp') ||
               text.includes('Invitar a WhatsApp') ||
               text.includes('Invite to WhatsApp');
      });

      // Si se encontró un mensaje de error, lanzamos el error y nos vamos.
      if (noWhatsAppFound) {
        this.logger.error(`❌ Número ${formattedPhone} no tiene WhatsApp o no se encontró.`);
        const error = new Error(`NO_WHATSAPP:${formattedPhone}`);
        error.name = 'NoWhatsAppError';
        throw error;
      }

      // --- PASO 4: ENCONTRAR EL CUADRO DE MENSAJE Y ENVIAR ---
      // Si no hubo error, asumimos que el chat se abrió. Buscamos el cuadro de mensaje.
      this.logger.log(`[PASO 4] Buscando el cuadro de mensaje...`);
      let messageBox: any;
      
      try {
        messageBox = await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 5000 });
        this.logger.log(`[PASO 4] ✅ Selector específico encontrado: div[contenteditable="true"][data-tab="10"]`);
      } catch (e) {
        this.logger.warn(`⚠️  Selector específico no encontrado, intentando alternativa...`);
        try {
          messageBox = await page.waitForSelector('[contenteditable="true"]', { timeout: 5000 });
          this.logger.log(`[PASO 4] ✅ Selector genérico encontrado: [contenteditable="true"]`);
        } catch (e2) {
          this.logger.error(`❌ Ningún selector de input encontrado`);
          const debugInfo = await page.evaluate(() => {
            const inputs = document.querySelectorAll('[contenteditable="true"]');
            const ariaInputs = document.querySelectorAll('[aria-label*="mensaje"]');
            return {
              contentEditableCount: inputs.length,
              ariaCount: ariaInputs.length,
              pageTitle: document.title,
              currentUrl: window.location.href,
            };
          });
          this.logger.log(`[DEBUG] ${JSON.stringify(debugInfo)}`);
          throw e2;
        }
      }

      if (!messageBox) throw new Error('No se encontró el cuadro de mensaje.');
      
      await messageBox.click();
      await this.sleep(this.afterClickDelay);
      this.logger.log(`[PASO 4] ✅ Cuadro de mensaje activo. Input encontrado y clickeado.`);

      // --- PASO 5: ESCRIBIR EL MENSAJE (LÍNEA POR LÍNEA CON SHIFT+ENTER) ---
      this.logger.log(`[PASO 5] Escribiendo el mensaje (${message.length} caracteres)...`);
      
      try {
        // Verificar que el input está enfocado
        const isFocused = await page.evaluate(() => {
          const input = document.querySelector('[contenteditable="true"]') as HTMLElement;
          return input === document.activeElement;
        });
        this.logger.log(`[PASO 5] Input enfocado: ${isFocused}`);
        
        if (!isFocused) {
          this.logger.warn(`⚠️  Input no está enfocado, clickeando nuevamente...`);
          await messageBox.click();
          await this.sleep(200);
        }

        // Dividir mensaje por saltos de línea y escribir línea por línea
        const lines = message.split('\n');
        this.logger.log(`[PASO 5] Escribiendo ${lines.length} líneas...`);
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (line.length > 0) {
            // Escribir la línea con delay pequeño
            await page.keyboard.type(line, { delay: 10 });
            this.logger.log(`[PASO 5] ✅ Línea ${i + 1}/${lines.length} escrita (${line.length} chars)`);
          }
          
          // Si no es la última línea, agregar salto de línea con Shift+Enter
          if (i < lines.length - 1) {
            await page.keyboard.down('Shift');
            await page.keyboard.press('Enter');
            await page.keyboard.up('Shift');
            await this.sleep(50);
            this.logger.log(`[PASO 5] ➕ Salto de línea insertado (Shift+Enter)`);
          }
        }
        
        this.logger.log(`[PASO 5] ✅ Todas las líneas escritas correctamente`);
      } catch (e) {
        this.logger.error(`[PASO 5] ❌ Error escribiendo mensaje:`, e);
        throw e;
      }

      await this.sleep(200);
      this.logger.log(`[PASO 5] ✅ Mensaje escrito completamente.`);

      // --- PASO 6: ENVIAR EL MENSAJE ---
      // Agregar delay aleatorio entre 0 y 3 segundos para parecer más humano
      const randomDelay = Math.random() * 3000; // 0-3000ms
      this.logger.log(`[PASO 6] Esperando ${randomDelay.toFixed(0)}ms antes de enviar (humanización)...`);
      await this.sleep(randomDelay);
      
      this.logger.log(`[PASO 6] Enviando mensaje...`);
      await page.keyboard.press('Enter'); // Enter para enviar el mensaje
      await this.sleep(1500); // Esperar a que se envíe

      this.logger.log(`[PASO 6] ✅ Mensaje enviado.`);

    } catch (error) {
      this.logger.error(`❌ Error al enviar mensaje a ${formattedPhone}: ${error.message}`);
      // El resto de tu bloque catch permanece igual...
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const screenshotPath = `error-${formattedPhone}-${timestamp}.png`;
      try {
        await page.screenshot({ path: screenshotPath as `${string}.png`, fullPage: true });
        this.logger.error(`📸 Captura guardada en: ${screenshotPath}`);
      } catch (screenError) {
        this.logger.error(`⚠️  No se pudo guardar screenshot: ${screenError.message}`);
      }
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
  const keys = await this.redisClient.keys('whatsapp-queue:*');
      const sessions = keys.map(key => key.replace('whatsapp-queue:', ''));

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