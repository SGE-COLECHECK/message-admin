import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { platform } from 'process';
import { SendAssistanceDto } from './dto/send-assistance.dto';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isConnecting = false;
  private messageQueue: { phoneNumber: string; message: string }[] = [];
  private isProcessingQueue = false;

  // Selectores centralizados
  private readonly SELECTORS = {
    SEARCH_BOX: 'div[contenteditable="true"][data-tab="3"]',
    MESSAGE_BOX: 'div[contenteditable="true"][data-tab="10"]',
  };

  constructor(private configService: ConfigService, private accountId: string = 'default') {
    this.logger = new Logger(`${WhatsappService.name} [${this.accountId}]`);
  }

  async onModuleInit() {
    // La lógica de conexión se maneja aquí para que el servicio esté listo al iniciar
    await this.connectBrowser();
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.logger.log('🔌 Desconectado del navegador.');
    }
  }

  private async connectBrowser(): Promise<void> {
    if (this.isConnecting) {
      this.logger.log('Ya hay una conexión en progreso. Esperando...');
      // Podríamos implementar una espera más sofisticada si es necesario
      return;
    }
    this.isConnecting = true;

    const debugPort = this.configService.get<string>('WHATSAPP_DEBUG_PORT');
    const browserType = this.configService.get<string>('WHATSAPP_BROWSER_TYPE');
    const browserWSEndpointFromConfig = this.configService.get<string>('WHATSAPP_WS_ENDPOINT');
    const isHeadless = this.configService.get<boolean>('WHATSAPP_HEADLESS_MODE', false);

    this.logger.log(`Modo Headless esperado: ${isHeadless}`);
    if (isHeadless) this.logger.warn('Asegúrate de haber iniciado el navegador en modo headless.');

    this.logger.log(`🎬 Intentando conectar con ${browserType} en el puerto ${debugPort}...`);

    let browserWSEndpoint: string;
    try {
      const response = await fetch(`http://localhost:${debugPort}/json/version`);
      if (!response.ok) {
        throw new Error(`No se pudo conectar al puerto de depuración. Estado: ${response.status}`);
      }
      const data = await response.json();
      browserWSEndpoint = data.webSocketDebuggerUrl;
    } catch (error) {
      this.logger.error(`❌ No se pudo conectar a ${browserType}.`);
      this.logger.error(`   Asegúrate de que ${browserType} esté abierto con --remote-debugging-port=${debugPort}`);
      
      let exampleCommand = 'google-chrome'; // Default para Chrome en Linux
      if (browserType?.toLowerCase() === 'edge') {
        if (platform === 'win32') exampleCommand = 'msedge.exe';
        else if (platform === 'darwin') exampleCommand = '/Applications/Microsoft\\ Edge.app/Contents/MacOS/Microsoft\\ Edge'; // macOS
        else exampleCommand = 'microsoft-edge'; // Linux
      }

      this.logger.error(`   Ejemplo: ${exampleCommand} --remote-debugging-port=${debugPort}`);

      this.isConnecting = false;
      return;
    }

    try {
      this.browser = await puppeteer.connect({ browserWSEndpoint: browserWSEndpointFromConfig || browserWSEndpoint });
      this.logger.log(`✅ Conectado al navegador ${browserType}.`);

      // --- INICIO: Lógica mejorada para identificar la cuenta y cargar WhatsApp ---
      const accountDescription = this.configService.get<string>('description', this.accountId);

      // 1. Abrir una página de bienvenida para identificar la ventana del navegador.
      const welcomePage = await this.browser.newPage();
      await welcomePage.setContent(`
        <html style="background-color: #2c3e50; color: #ecf0f1; display: flex; justify-content: center; align-items: center; height: 100%; font-family: sans-serif;">
          <head><title>${accountDescription}</title></head>
          <body><h1>Conectando a: ${accountDescription}</h1></body>
        </html>
      `);

      // 2. Buscar una página de WhatsApp existente o crear una nueva.
      const pages = await this.browser.pages();
      const whatsappUrl = this.configService.get<string>('WHATSAPP_URL', 'https://web.whatsapp.com/');
      this.page = pages.find(p => p.url().startsWith(whatsappUrl)) || await this.browser.newPage();
      
      if (!this.page.url().startsWith(whatsappUrl)) {
        this.logger.log(`No se encontró página de WhatsApp. Navegando a ${whatsappUrl}...`);
        await this.page.goto(whatsappUrl, { waitUntil: 'networkidle2' });
      }
      // --- FIN: Lógica mejorada ---

      // Ajustar el tamaño de la ventana (viewport)
      const width = +this.configService.get<string>('WHATSAPP_VIEWPORT_WIDTH', '1280');
      const height = +this.configService.get<string>('WHATSAPP_VIEWPORT_HEIGHT', '800');
      if (this.page) {
        await this.page.setViewport({ width, height });
        this.logger.log(`📐 Viewport ajustado a ${width}x${height}.`);
      }
      
      this.logger.log('🔍 Verificando sesión de WhatsApp...');
      try {
        await this.page.waitForSelector(this.SELECTORS.SEARCH_BOX, { timeout: 10000 });
        this.logger.log('✅ Sesión de WhatsApp activa y lista.');
      } catch (error) {
        this.logger.warn('⚠️ Sesión no detectada. Por favor, escanea el código QR en la ventana del navegador.');
        this.logger.warn('   El servicio esperará 60 segundos para la sesión...');
        try {
          await this.page.waitForSelector(this.SELECTORS.SEARCH_BOX, { timeout: 60000 });
          this.logger.log('✅ Sesión iniciada correctamente.');
        } catch (e) {
          this.logger.error('❌ Tiempo de espera agotado. La sesión no se pudo verificar.');
          // Considerar cerrar el navegador o reintentar
        }
      }
    } catch (error) {
      this.logger.error('❌ Fallo crítico al conectar o preparar la página de WhatsApp.', error);
    } finally {
      this.isConnecting = false;
    }
  }

  private generateAssistanceMessage(reportData: SendAssistanceDto): string {
    const { student, time_assistance, type_assistance } = reportData;

    const formatDate = (date: Date): string => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    };

    const abbreviateName = (fullName: string): string => {
      // Filtra para eliminar espacios en blanco accidentales y obtener un array limpio de partes del nombre.
      const parts = fullName.trim().split(/\s+/).filter(p => p);
      if (parts.length === 0) {
        return ''; // Si el nombre está vacío, devuelve una cadena vacía.
      }

      // Asume que el primer elemento es el primer nombre y el penúltimo es el apellido paterno.
      const firstName = parts[0];
      const firstSurname = parts.length > 1 ? parts[parts.length - 2] : '';
      const secondSurname = parts.length > 1 ? parts[parts.length - 1] : '';

      // Construye el nombre abreviado de forma segura.
      return `${firstName.toUpperCase()} ${firstSurname.toUpperCase()} ${secondSurname ? secondSurname.charAt(0).toUpperCase() + '.' : ''}`.trim();
    };

    const formatTime = (time: string): string => time.substring(0, 5);
    const registro = type_assistance === 'entrance' ? 'ENTRADA' : 'SALIDA';
    const formattedDate = formatDate(new Date());
    const formattedTime = formatTime(time_assistance);
    const abbreviatedName = abbreviateName(student);

    const initialEmoji = '🚨';
    const header = `${initialEmoji}🇨​​​​​🇴​​​​​🇱​​​​​🇪✅ [${formattedDate}]`;
    const separator = '➖➖➖➖➖➖➖➖➖➖';
    const studentLine = `🎓 *Estudiante:* ▫️ ${abbreviatedName}`;
    const timeLine = `⏰ *${registro}:* ▫️${formattedTime}`;
    const footer = '✨ ¡Gracias por su apoyo! 🙂 ✨';

    return `${header}\n${separator}\n${studentLine}\n${timeLine}\n${separator}\n${footer}`;
  }

  private async sendMessage(phoneNumber: string, message: string): Promise<void> {
    if (!this.page) {
      this.logger.error('❌ La página de WhatsApp no está inicializada. No se puede enviar el mensaje.');
      throw new Error('Página de WhatsApp no disponible.');
    }

    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    const countryCode = this.configService.get<string>('WHATSAPP_COUNTRY_CODE', '51');
    if (!formattedPhone.startsWith(countryCode) && formattedPhone.length === 9) {
      formattedPhone = countryCode + formattedPhone;
    }

    try {
      this.logger.log(`🚀 Enviando mensaje a ${formattedPhone}...`);
      
      const searchBox = await this.page.waitForSelector(this.SELECTORS.SEARCH_BOX, { timeout: 15000 });
      if (!searchBox) throw new Error('No se encontró el cuadro de búsqueda.');
      await searchBox.click({ clickCount: 3 });
      await this.page.keyboard.press('Backspace');
      await this.page.type(this.SELECTORS.SEARCH_BOX, formattedPhone, { delay: 100 });
      await this.page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 1500));

      const noWhatsAppFound = await this.page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('No se encontró el chat') || text.includes('Invitar a WhatsApp') || text.includes('No chat found') || text.includes('Invite to WhatsApp');
      });

      // --- INICIO: Validación de seguridad crítica ---
      // Verifica que el chat abierto corresponde al número buscado.
      // Esto evita enviar un mensaje al chat anterior si el número no se encuentra.
      const chatHeaderTitle = await this.page.evaluate(() => {
        const header = document.querySelector('header [data-testid="conversation-header"]');
        const titleElement = header?.querySelector('span[dir="auto"]');
        return titleElement?.getAttribute('title')?.replace(/[\s\-\+]/g, '');
      });

      if (!chatHeaderTitle || !chatHeaderTitle.includes(formattedPhone)) {
        this.logger.error(`¡ERROR DE SEGURIDAD! El chat abierto (${chatHeaderTitle}) no coincide con el número buscado (${formattedPhone}). Abortando envío.`);
        const backButton = await this.page.$('button[aria-label="Atrás"], button[aria-label="Back"]');
        if (backButton) await backButton.click();
        throw new Error(`El número ${formattedPhone} no se encontró o no se pudo abrir el chat correcto.`);
      }
      this.logger.log(`✅ Verificación de chat correcta. Chat abierto: ${chatHeaderTitle}`);
      // --- FIN: Validación de seguridad crítica ---

      if (noWhatsAppFound) {
        // --- INICIO: Lógica de seguridad para evitar envío a contacto incorrecto ---
        this.logger.warn(`El número ${formattedPhone} no tiene WhatsApp. Limpiando búsqueda...`);
        // Busca y hace clic en el botón "Atrás" para salir de la pantalla de "no encontrado"
        const backButton = await this.page.$('button[aria-label="Atrás"], button[aria-label="Back"]');
        if (backButton) {
          await backButton.click();
        }
        // --- FIN: Lógica de seguridad ---
        throw new Error(`El número ${formattedPhone} no tiene WhatsApp.`);
      }

      const messageBox = await this.page.waitForSelector(this.SELECTORS.MESSAGE_BOX, { timeout: 5000 });
      
      if (!messageBox) throw new Error('No se encontró el cuadro de mensaje.');
      await messageBox.click();
      await new Promise(resolve => setTimeout(resolve, 200));

      // --- INICIO: Revertido a escritura rápida y fiable ---
      const lines = message.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Se reduce el delay a 10ms para una escritura muy rápida pero que sigue siendo "humana"
        await this.page.keyboard.type(lines[i], { delay: 10 });
        if (i < lines.length - 1) {
          // Simula Shift+Enter para un salto de línea en WhatsApp
          await this.page.keyboard.down('Shift');
          await this.page.keyboard.press('Enter');
          await this.page.keyboard.up('Shift');
          // Pequeña pausa para asegurar que el salto de línea se procese
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
      // --- FIN: Revertido a escritura rápida y fiable ---
      
      const randomDelay = Math.random() * 2000 + 1000;
      await new Promise(resolve => setTimeout(resolve, randomDelay));
      await this.page.keyboard.press('Enter');
      
      this.logger.log(`✅ Mensaje enviado a ${formattedPhone} con éxito.`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Log de uso de memoria
      if (this.page) {
        const metrics = await this.page.metrics();
        this.logger.log(`📊 Uso de memoria (JS Heap): ${((metrics.JSHeapTotalSize ?? 0) / 1024 / 1024).toFixed(2)} MB`);
      }

    } catch (error) {
      let errorMessage = 'Error desconocido';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      this.logger.error(`❌ Error al enviar mensaje a ${formattedPhone}: ${errorMessage}`);
      throw new Error(`Fallo al enviar mensaje a ${formattedPhone}: ${errorMessage}`);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return; // Ya hay un proceso en ejecución
    }

    if (this.messageQueue.length === 0) {
      return; // La cola está vacía
    }

    this.isProcessingQueue = true;
    this.logger.log(`🏃‍♂️ Iniciando procesamiento de cola. Mensajes pendientes: ${this.messageQueue.length}`);

    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift(); // Tomar el primer elemento de la cola
      if (item) {
        try {
          this.logger.log(`📨 Procesando mensaje para ${item.phoneNumber}...`);
          await this.sendMessage(item.phoneNumber, item.message);
        } catch (error) {
          this.logger.error(`❌ Falló el envío del mensaje encolado para ${item.phoneNumber}. Error: ${error instanceof Error ? error.message : 'Desconocido'}`);
          // El error ya se loguea en sendMessage, pero lo logueamos aquí también para el contexto de la cola.
        }
      }
    }

    this.isProcessingQueue = false;
    this.logger.log('🏁 Procesamiento de cola finalizado.');
  }

  public async sendAssistanceReport(reportData: SendAssistanceDto): Promise<string> {
    // La validación de conexión se hace antes de encolar
    if (!this.isReady()) {
      throw new Error('El servicio de WhatsApp no está listo. No se puede encolar el mensaje.');
    }
    
    const message = this.generateAssistanceMessage(reportData);
    this.messageQueue.push({ phoneNumber: reportData.phoneNumber, message });
    this.logger.log(`📥 Mensaje para ${reportData.student} añadido a la cola. Total en cola: ${this.messageQueue.length}`);

    // Dispara el procesador de la cola (no se espera a que termine)
    this.processQueue();

    return `Reporte para ${reportData.student} ha sido encolado.`;
  }

  public isReady(): boolean {
    return !!this.page && !!this.browser?.isConnected();
  }
}