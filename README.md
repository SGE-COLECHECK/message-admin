NestJS arranca
   ↓
Carga WhatsappModule
   ↓
Ejecuta onModuleInit() → lanza Puppeteer
   ↓
Puppeteer abre navegador → va a web.whatsapp.com
   ↓
(Desde el navegador puedes escanear el QR)
   ↓
Puedes controlar abrir/cerrar desde /whatsapp/open o /whatsapp/close



src/
├── app.module.ts
├── main.ts
│
├── common/                     # Código reutilizable en toda la app
│   ├── constants/              # Constantes (ej. SELECTORES DE CSS)
│   ├── decorators/             # Decoradores personalizados
│   ├── filters/                # Filtros de excepción global
│   └── utils/                  # Funciones de ayuda (ej. formatear número)
│
├── config/                     # Configuración (TypeORM, Redis, etc.)
│   └── configuration.ts        # Usando @nestjs/config
│
├── whatsapp/                   # Módulo principal de WhatsApp
│   ├── dto/                    # Data Transfer Objects
│   │   ├── create-session.dto.ts
│   │   └── send-message.dto.ts
│   ├── interfaces/             # Contratos y Tipos
│   │   └── session.interface.ts
│   ├── whatsapp.module.ts
│   ├── whatsapp.controller.ts  # Solo maneja peticiones HTTP
│   └── services/               # Lógica de negocio, dividida
│       ├── session-manager.service.ts  # ¡CLAVE! Gestiona múltiples sesiones
│       ├── browser.service.ts          # Lanza y cierra el navegador
│       ├── auth.service.ts             # Maneja QR y estado de login
│       └── scraper.service.ts          # Interactúa con el DOM de WhatsApp
│
├── messaging/                  # Módulo de colas de mensajes
│   ├── dto/
│   │   └── message-job.dto.ts
│   ├── messaging.module.ts
│   ├── processors/
│   │   └── message.processor.ts       # El "trabajador" que procesa la cola
│   └── interfaces/
│       └── job.interface.ts
│
└── public/
    └── index.html




    import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import { SendAssistanceDto } from '../dto/send-assistance.dto';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;
  private readonly profilePath = path.join(process.cwd(), 'profiles', 'default');
  private isAuthenticated = false;

  constructor() {
    if (!fs.existsSync(this.profilePath)) {
      fs.mkdirSync(this.profilePath, { recursive: true });
      this.logger.log('📁 Directorio de perfiles creado');
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async initializeBrowser(): Promise<void> {
    if (this.browser && this.page) {
      this.logger.log('♻️ Reutilizando navegador existente');
      return;
    }

    this.logger.log('🚀 Iniciando navegador con perfil de usuario...');

    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1280,800',
        '--disable-blink-features=AutomationControlled'
      ],
      userDataDir: this.profilePath,
    });

    this.page = await this.browser.newPage();

    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    await this.page.setDefaultTimeout(60000);
    await this.page.setDefaultNavigationTimeout(60000);

    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    this.logger.log('🌐 Navegando a WhatsApp Web...');
    await this.page.goto('https://web.whatsapp.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await this.sleep(3000);

    this.logger.log('✅ Navegador listo en WhatsApp Web');
  }

  async getQrCode(): Promise<{ qrCode?: string; message: string; isAuthenticated: boolean }> {
    await this.initializeBrowser();

    if (!this.page) {
      throw new Error('No se pudo inicializar la página');
    }

    this.logger.log('⏳ Verificando estado de autenticación...');

    try {
      this.logger.log('⏳ Esperando que cargue la interfaz...');
      await this.sleep(5000);

      const screenshotPath = 'debug-whatsapp.png';
      await this.page.screenshot({ path: screenshotPath, fullPage: false });
      this.logger.log(`📸 Screenshot guardado en: ${screenshotPath}`);

      const pageInfo = await this.page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        const bodyText = document.body.innerText;

        return {
          canvasCount: canvases.length,
          canvases: canvases.map((c, i) => ({
            index: i,
            ariaLabel: c.getAttribute('aria-label'),
            role: c.getAttribute('role'),
            className: c.className,
            width: c.width,
            height: c.height,
            parentClass: c.parentElement?.className || 'no-parent'
          })),
          hasQrContainer: !!document.querySelector('[data-ref]'),
          bodyText: bodyText.substring(0, 200)
        };
      });

      this.logger.log('📊 Información de la página:');
      this.logger.log(JSON.stringify(pageInfo, null, 2));

      // Verificar si está autenticado
      this.logger.log('🔍 Buscando indicadores de sesión activa...');
      const authCheck = await this.page.evaluate(() => {
        const bodyText = document.body.innerText;
        const hasChatsText = bodyText.includes('Buscar un chat') ||
          bodyText.includes('Todos') ||
          bodyText.includes('No leídos') ||
          bodyText.includes('Favoritos') ||
          bodyText.includes('Grupos');

        const hasChats = !!document.querySelector('[data-testid="chat-list"]');
        const hasHeader = !!document.querySelector('header[data-testid="chatlist-header"]');
        const hasConversation = !!document.querySelector('[data-testid="conversation-panel-wrapper"]');
        const hasSidebar = !!document.querySelector('[data-testid="default-user"]');
        const hasMainApp = !!document.querySelector('div#app > div > div');
        const noQrCanvas = document.querySelectorAll('canvas').length === 0;
        const hasSidePanel = !!document.querySelector('[data-testid="side"]') ||
          !!document.querySelector('div[role="navigation"]');

        return {
          hasChats,
          hasHeader,
          hasConversation,
          hasSidebar,
          hasMainApp,
          hasChatsText,
          noQrCanvas,
          hasSidePanel
        };
      });

      this.logger.log('🔐 Indicadores de autenticación:', JSON.stringify(authCheck, null, 2));

      const isLoggedIn = authCheck.hasChatsText ||
        authCheck.hasChats ||
        authCheck.hasHeader ||
        authCheck.hasConversation ||
        authCheck.hasSidebar ||
        authCheck.hasSidePanel ||
        (authCheck.noQrCanvas && authCheck.hasMainApp);

      if (isLoggedIn) {
        this.logger.log('✅ Sesión ya activa. Usuario autenticado.');
        this.isAuthenticated = true;
        return {
          message: 'Sesión activa. Ya estás autenticado.',
          isAuthenticated: true
        };
      }

      // Buscar el QR
      this.logger.log('🔍 Buscando código QR...');

      let qrCanvas: puppeteer.ElementHandle<HTMLCanvasElement> | null =
        await this.page.$('canvas[aria-label*="Scan"]') as puppeteer.ElementHandle<HTMLCanvasElement> | null;

      if (!qrCanvas) {
        qrCanvas = await this.page.$('[data-ref] canvas') as puppeteer.ElementHandle<HTMLCanvasElement> | null;
      }

      if (!qrCanvas) {
        const possibleCanvas = await this.page.evaluate(() => {
          const canvases = Array.from(document.querySelectorAll('canvas'));
          const largeCanvas = canvases.find(c => c.width > 200 && c.height > 200);
          if (largeCanvas) {
            largeCanvas.id = 'qr-temp-id';
            return true;
          }
          return false;
        });

        if (possibleCanvas) {
          qrCanvas = await this.page.$('#qr-temp-id') as puppeteer.ElementHandle<HTMLCanvasElement> | null;
        }
      }

      if (qrCanvas) {
        this.logger.log('✅ Canvas del QR encontrado');

        const qrCodeDataUrl = await this.page.evaluate(() => {
          const canvases = Array.from(document.querySelectorAll('canvas'));
          const qrCanvas = canvases.find(c => c.width > 200 && c.height > 200);

          if (!qrCanvas) return null;

          try {
            return qrCanvas.toDataURL('image/png');
          } catch (e) {
            console.error('Error al extraer QR:', e);
            return null;
          }
        });

        if (qrCodeDataUrl && qrCodeDataUrl !== 'data:,') {
          this.logger.log('✅ QR extraído exitosamente');

          this.waitForAuthentication().catch(err =>
            this.logger.warn('⚠️ Timeout esperando autenticación:', err.message)
          );

          return {
            qrCode: qrCodeDataUrl,
            message: 'QR generado. Escanea para autenticar.',
            isAuthenticated: false
          };
        } else {
          this.logger.error('❌ No se pudo extraer el dataURL del canvas');
        }
      }

      this.logger.warn('⚠️ No se encontró QR ni sesión activa');
      throw new Error(
        'No se pudo encontrar el QR. Posibles causas: ' +
        '1) WhatsApp Web está cargando, ' +
        '2) Ya hay una sesión activa, ' +
        '3) El selector del QR cambió. ' +
        'Revisa el screenshot en debug-whatsapp.png'
      );

    } catch (error) {
      this.logger.error('❌ Error al verificar estado de login:', error.message);

      try {
        const errorPath = 'error-whatsapp.png';
        await this.page.screenshot({ path: errorPath });
        this.logger.log(`📸 Screenshot del error guardado en: ${errorPath}`);
      } catch (e) {
        this.logger.warn('No se pudo tomar screenshot del error');
      }

      throw new Error(`Error al obtener estado de WhatsApp: ${error.message}`);
    }
  }

  private async waitForAuthentication(): Promise<void> {
    if (!this.page) return;

    this.logger.log('⏳ Esperando autenticación (hasta 2 minutos)...');

    try {
      await this.page.waitForFunction(
        () => {
          const bodyText = document.body.innerText;
          const hasChatsText = bodyText.includes('Buscar un chat') ||
            bodyText.includes('Todos') ||
            bodyText.includes('No leídos');

          const hasChats = !!document.querySelector('[data-testid="chat-list"]');
          const hasHeader = !!document.querySelector('header[data-testid="chatlist-header"]');
          const hasSidebar = !!document.querySelector('[data-testid="default-user"]');
          const hasSidePanel = !!document.querySelector('[data-testid="side"]') ||
            !!document.querySelector('div[role="navigation"]');
          const noQR = document.querySelectorAll('canvas').length === 0;
          const hasLayout = !!document.querySelector('div#app > div > div > div');

          return hasChatsText || hasChats || hasHeader || hasSidebar || hasSidePanel || (noQR && hasLayout);
        },
        { timeout: 120000, polling: 500 }
      );

      await this.sleep(2000);

      this.isAuthenticated = true;
      this.logger.log('🎉 ¡Autenticación exitosa!');
    } catch (error) {
      this.logger.warn('⚠️ Timeout esperando autenticación (2 min)');
    }
  }

  async checkAuthStatus(): Promise<{ isAuthenticated: boolean; message: string }> {
    if (!this.browser || !this.page) {
      return {
        isAuthenticated: false,
        message: 'Navegador no inicializado'
      };
    }

    try {
      await this.sleep(1000);

      const authCheck = await this.page.evaluate(() => {
        const bodyText = document.body.innerText;
        const hasChatsText = bodyText.includes('Buscar un chat') ||
          bodyText.includes('Todos') ||
          bodyText.includes('No leídos') ||
          bodyText.includes('Favoritos') ||
          bodyText.includes('Grupos');

        const hasChats = !!document.querySelector('[data-testid="chat-list"]');
        const hasHeader = !!document.querySelector('header[data-testid="chatlist-header"]');
        const hasConversation = !!document.querySelector('[data-testid="conversation-panel-wrapper"]');
        const hasSidebar = !!document.querySelector('[data-testid="default-user"]');
        const hasNoQR = document.querySelectorAll('canvas').length === 0;
        const hasMainLayout = !!document.querySelector('div#app > div > div > div');
        const hasSidePanel = !!document.querySelector('[data-testid="side"]') ||
          !!document.querySelector('div[role="navigation"]');

        return {
          hasChats,
          hasHeader,
          hasConversation,
          hasSidebar,
          hasNoQR,
          hasMainLayout,
          hasSidePanel,
          hasChatsText
        };
      });

      this.logger.log('🔍 Estado de autenticación:', JSON.stringify(authCheck, null, 2));

      this.isAuthenticated =
        authCheck.hasChatsText ||
        authCheck.hasChats ||
        authCheck.hasHeader ||
        authCheck.hasConversation ||
        authCheck.hasSidebar ||
        authCheck.hasSidePanel ||
        (authCheck.hasNoQR && authCheck.hasMainLayout);

      return {
        isAuthenticated: this.isAuthenticated,
        message: this.isAuthenticated ? 'Usuario autenticado' : 'Usuario no autenticado'
      };
    } catch (error) {
      this.logger.error('❌ Error al verificar autenticación:', error);
      return {
        isAuthenticated: false,
        message: 'Error al verificar autenticación'
      };
    }
  }

  async closeBrowser(): Promise<{ message: string }> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isAuthenticated = false;
      this.logger.log('🔌 Navegador cerrado');
      return { message: 'Navegador cerrado exitosamente' };
    }
    return { message: 'El navegador no estaba activo' };
  }

  async logout(): Promise<{ message: string }> {
    try {
      await this.closeBrowser();

      if (fs.existsSync(this.profilePath)) {
        fs.rmSync(this.profilePath, { recursive: true, force: true });
        fs.mkdirSync(this.profilePath, { recursive: true });
        this.logger.log('🗑️ Sesión eliminada');
      }

      return { message: 'Sesión cerrada. Deberás escanear el QR nuevamente.' };
    } catch (error) {
      this.logger.error('❌ Error al cerrar sesión:', error);
      throw new Error('Error al cerrar sesión');
    }
  }

  async sendMessage(phoneNumber: string, message: string): Promise<{ success: boolean; message: string }> {
    if (!this.browser || !this.page) {
      throw new Error('Navegador no inicializado. Primero debes autenticarte.');
    }

    if (!this.isAuthenticated) {
      const status = await this.checkAuthStatus();
      if (!status.isAuthenticated) {
        throw new Error('No estás autenticado. Escanea el QR primero.');
      }
    }

    try {
      this.logger.log(`📤 Enviando mensaje a ${phoneNumber}...`);

      let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
      if (!formattedPhone.startsWith('+')) {
        if (!formattedPhone.startsWith('51')) formattedPhone = '51' + formattedPhone;
      } else {
        formattedPhone = formattedPhone.substring(1);
      }
      this.logger.log(`📱 Número para buscar: ${formattedPhone}`);

      // 1. Buscar el cuadro de búsqueda
      this.logger.log('🔍 Paso 1: Buscando cuadro de búsqueda...');
      const searchBox = await this.page.$('div[contenteditable="true"][data-tab="3"]') ||
        await this.page.$('div[title*="Buscar"]') ||
        await this.page.$('div[role="textbox"]');

      if (!searchBox) {
        await this.page.screenshot({ path: 'error-1-busqueda.png', fullPage: true });
        throw new Error('No se encontró el cuadro de búsqueda. Revisa error-1-busqueda.png');
      }
      this.logger.log('✅ Cuadro de búsqueda encontrado.');

      // 2. Hacer clic y limpiar
      this.logger.log('🖱️ Paso 2: Haciendo clic y limpiando buscador...');
      await searchBox.click();
      await this.sleep(500);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.sleep(300);

      // 3. Escribir el número
      this.logger.log(`⌨️ Paso 3: Escribiendo número: ${formattedPhone}`);
      await this.page.type('div[contenteditable="true"][data-tab="3"]', formattedPhone, { delay: 100 });
      await this.sleep(2000);

      // 4. Presionar Enter
      this.logger.log('⏎ Paso 4: Abriendo chat...');
      await this.page.keyboard.press('Enter');
      await this.sleep(2000);

      // 5. Buscar el cuadro de mensaje
      this.logger.log('✍️ Paso 5: Buscando cuadro de mensaje...');
      await this.page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 10000 });
      const messageBox = await this.page.$('div[contenteditable="true"][data-tab="10"]');

      if (!messageBox) {
        await this.page.screenshot({ path: 'error-5-cuadro-mensaje.png', fullPage: true });
        throw new Error('No se encontró el cuadro de mensaje. Revisa error-5-cuadro-mensaje.png');
      }
      this.logger.log('✅ Cuadro de mensaje encontrado.');

      // 6. Hacer clic en el cuadro de mensaje
      await messageBox.click();
      await this.sleep(300);

      // 7. ¡LA MAGIA CON SHIFT+ENTER! Escribir el mensaje línea por línea.
      this.logger.log(`📝 Paso 6: Escribiendo el mensaje línea por línea con Shift+Enter...`);

      // 1. Dividir el mensaje en líneas usando el carácter de salto de línea \n
      const lines = message.split('\n');
      this.logger.log(`📄 El mensaje tiene ${lines.length} líneas.`);

      // 2. Iterar sobre cada línea para escribirla
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        this.logger.log(`🖊️ Escribiendo línea ${i + 1}: "${line}"`);

        // Escribir el contenido de la línea
        await this.page.type('div[contenteditable="true"][data-tab="10"]', line, { delay: 50 });

        // Si no es la última línea, presionar Shift+Enter para hacer un salto de línea
        if (i < lines.length - 1) {
          this.logger.log(`🔄 Presionando Shift+Enter para salto de línea.`);
          await this.page.keyboard.down('Shift');
          await this.page.keyboard.press('Enter');
          await this.page.keyboard.up('Shift');
          // Pequeña pausa para que WhatsApp procese el salto de línea
          await this.sleep(100);
        }
      }

      // 3. Enviar el mensaje final con un Enter normal
      this.logger.log('📮 Paso 7: Enviando mensaje con Enter...');
      await this.page.keyboard.press('Enter');
      await this.sleep(1500);

      this.logger.log('✅ Mensaje enviado correctamente');
      return { success: true, message: `Mensaje enviado a ${formattedPhone}` };

    } catch (error) {
      this.logger.error('❌ Error al enviar mensaje:', error.message);
      try {
        await this.page.screenshot({ path: 'error-general.png', fullPage: true });
        this.logger.log('📸 Screenshot del error general guardado en error-general.png');
      } catch (e) { /* Ignorar */ }
      throw new Error(`Error al enviar mensaje: ${error.message}`);
    }
  }



  async sendAssistanceReport(reportData: SendAssistanceDto): Promise<{ success: boolean; message: string }> {
    const { student, time_assistance, type_assistance, phoneNumber } = reportData;

    const registro = type_assistance === 'entrance' ? 'ENTRADA' : 'SALIDA';

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    // 1. Construimos el mensaje con saltos de línea normales (\n). ¡Así está perfecto!
    const message = `🚨🇨​​​​​🇴​​​​​🇱​​​​​🇪✅ [ ${formattedDate} ]🚨

📝 Reporte Diario
➖➖➖➖➖➖➖➖➖
🎓 *Estudiante*: ▫️${student.toUpperCase()}
⏰ *Hora de Registro*: ▫️${time_assistance}
📍 *Ubicación*: ▫️Puerta
✅  *Registro*: ▫️${registro}
➖➖➖➖➖➖➖➖➖

✨ ¡Gracias por su apoyo! 🙂 ✨`;

    // 2. Eliminamos la conversión a HTML.
    //    El método sendMessage (con Shift+Enter) se encargará de los saltos de línea.
    // const htmlMessage = plainTextMessage.replace(/\n/g, '<br>'); <-- BORRAR ESTA LÍNEA

    // 3. Llamamos a sendMessage con el mensaje en texto plano.
    return this.sendMessage(phoneNumber, message);
  }
}