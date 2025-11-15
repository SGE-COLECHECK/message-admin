import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private readonly browsers = new Map<string, puppeteer.Browser>();
  private readonly DEFAULT_TIMEOUT = 30000;

  /**
   * Crea un directorio de perfil para una sesión específica
   * @param sessionName Nombre de la sesión
   * @returns Ruta del directorio de perfil creado
   */
  createProfileDir(sessionName: string): string {
    const profilePath = path.join(process.cwd(), 'profiles', sessionName);
    
    // Crea el directorio del perfil si no existe
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
      this.logger.log(`📁 Directorio de perfil creado: ${profilePath}`);
    }
    
    return profilePath;
  }

  async launchBrowser(sessionName: string, profilePath: string): Promise<puppeteer.Browser> {
    // Verifica si el browser existe y sigue conectado
    if (this.browsers.has(sessionName)) {
      const existingBrowser = this.browsers.get(sessionName)!;
      if (existingBrowser.isConnected()) {
        this.logger.log(`♻️ Reutilizando navegador existente para '${sessionName}'`);
        return existingBrowser;
      }
      // Si está desconectado, elimínalo del mapa
      this.browsers.delete(sessionName);
      this.logger.warn(`⚠️ Browser '${sessionName}' desconectado, se creará uno nuevo`);
    }

    // Crea el directorio del perfil si no existe
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
      this.logger.log(`📁 Directorio de perfil creado: ${profilePath}`);
    }

    // Limpia SingletonLock para evitar conflictos
    const singletonLockPath = path.join(profilePath, 'SingletonLock');
    if (fs.existsSync(singletonLockPath)) {
      try {
        fs.unlinkSync(singletonLockPath);
        this.logger.log(`🧹 SingletonLock eliminado para '${sessionName}'`);
      } catch (error) {
        this.logger.warn(`⚠️ No se pudo eliminar SingletonLock: ${error.message}`);
      }
    }

    this.logger.log(`🚀 Iniciando navegador headless para '${sessionName}'`);
    
    try {
      // Configuración para lanzar el navegador SIN especificar executablePath
      // Esto hará que Puppeteer use su propio navegador Chromium
      const launchOptions: puppeteer.LaunchOptions = {
        //headless: true,
        headless: false, 
        userDataDir: profilePath,
        args: this.getLaunchArgs(),
        timeout: this.DEFAULT_TIMEOUT,
        protocolTimeout: this.DEFAULT_TIMEOUT,
        // Evita detección de automatización
        ignoreDefaultArgs: ['--enable-automation'],
      };

      const browser = await puppeteer.launch(launchOptions);

      // Configura el user agent después de lanzar
      const pages = await browser.pages();
      if (pages.length > 0) {
        await this.configurePage(pages[0]);
      }

      // Maneja desconexiones inesperadas
      browser.on('disconnected', () => {
        this.logger.warn(`🔌 Browser '${sessionName}' desconectado inesperadamente`);
        this.browsers.delete(sessionName);
      });

      const version = await browser.version();
      this.logger.log(`✅ Browser ${version} iniciado para '${sessionName}'`);
      
      this.browsers.set(sessionName, browser);
      return browser;
    } catch (error) {
      this.logger.error(`❌ Error iniciando browser para '${sessionName}':`, error);
      throw error;
    }
  }

  private getLaunchArgs(): string[] {
    return [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // ✅ CRÍTICO para Docker
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
      '--no-first-run',
      '--disable-popup-blocking',
      '--disable-notifications',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--password-store=basic',
      '--use-mock-keychain',
      '--force-webrtc-ip-handling-policy=default_public_interface_only',
      '--metrics-recording-only',
      '--disable-features=InterestFeedContentSuggestions',
      '--disable-hang-monitor',
      '--disable-gpu', // ✅ Importante en servidores sin GPU
      '--disable-software-rasterizer',
      '--window-size=800,700',
      '--single-process', // ✅ Reduce uso de recursos en Docker
      '--no-zygote', // ✅ Mejora aislamiento en contenedores
    ];
  }

  async createPage(sessionName: string): Promise<puppeteer.Page> {
    const browser = this.browsers.get(sessionName);
    if (!browser || !browser.isConnected()) {
      throw new Error(`❌ Browser '${sessionName}' no iniciado o desconectado. Llama launchBrowser primero.`);
    }

    const page = await browser.newPage();
    await this.configurePage(page);
    
    this.logger.log(`📄 Nueva página creada para '${sessionName}'`);
    return page;
  }

private async configurePage(page: puppeteer.Page): Promise<void> {
  // Evasión de detección de automatización
  await page.evaluateOnNewDocument(() => {
    // Elimina señales de webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Simula plugins reales
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Simula lenguajes
    Object.defineProperty(navigator, 'languages', {
      get: () => ['es-ES', 'es'],
    });
    
    // Mockea chrome object
    (window as any).chrome = {
      runtime: {},
    };
  });

  // User agent realista
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Timeouts configurables desde env
  const pageTimeout = parseInt(process.env.PUPPETEER_PAGE_TIMEOUT || '30000');
  const navTimeout = parseInt(process.env.PUPPETEER_NAVIGATION_TIMEOUT || '30000');
  
  await page.setDefaultTimeout(pageTimeout);
  await page.setDefaultNavigationTimeout(navTimeout);

  // ✅ CORREGIDO: Permite CSS y Fuentes, pero sigue bloqueando imágenes para velocidad
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    // Solo bloqueamos imágenes y media, que son lo que más pesa y no son críticos para enviar texto
    if (['image', 'media'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });
}
  async closeBrowser(sessionName: string): Promise<void> {
    const browser = this.browsers.get(sessionName);
    if (browser && browser.isConnected()) {
      this.logger.log(`🔌 Cerrando browser '${sessionName}'`);
      await browser.close();
      this.browsers.delete(sessionName);
    } else {
      this.logger.warn(`⚠️ Browser '${sessionName}' ya estaba cerrado o no existe`);
    }
  }

  // ✅ Método para verificar salud (útil para healthchecks)
  async isBrowserHealthy(sessionName: string): Promise<boolean> {
    const browser = this.browsers.get(sessionName);
    return browser?.isConnected() ?? false;
  }

  // ✅ Limpieza al apagar la aplicación
  async onModuleDestroy(): Promise<void> {
    this.logger.log('🛑 Apagando BrowserService...');
    const closePromises = Array.from(this.browsers.keys()).map(session => 
      this.closeBrowser(session).catch(err => 
        this.logger.error(`Error cerrando browser '${session}':`, err)
      )
    );
    await Promise.allSettled(closePromises);
    this.logger.log('✅ Todos los browsers cerrados');
  }

  // ✅ Método alternativo para obtener o crear página
  async getOrCreatePage(sessionName: string, profilePath: string): Promise<puppeteer.Page> {
    let browser = this.browsers.get(sessionName);
    if (!browser || !browser.isConnected()) {
      browser = await this.launchBrowser(sessionName, profilePath);
    }
    
    const pages = await browser.pages();
    if (pages.length > 0) {
      return pages[0];
    }
    return this.createPage(sessionName);
  }
}