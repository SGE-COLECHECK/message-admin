import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);
  private readonly browsers = new Map<string, puppeteer.Browser>();

  async launchBrowser(sessionName: string, profilePath: string): Promise<puppeteer.Browser> {
    if (this.browsers.has(sessionName)) {
      this.logger.log(`♻️ Reutilizando navegador existente para la sesión '${sessionName}'`);
      return this.browsers.get(sessionName)!;
    }

    this.logger.log(`🚀 Iniciando navegador para la sesión '${sessionName}' con perfil en ${profilePath}`);
    const browser = await puppeteer.launch({
      headless: false,
      //headless: true,
      userDataDir: profilePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=800,600',
        '--disable-blink-features=AutomationControlled',
        '--disable-session-crashed-bubble',
        '--disable-infobars',
        '--no-first-run',
        '--disable-popup-blocking',
        '--disable-notifications',
      ],
    });

    this.browsers.set(sessionName, browser);
    this.logger.log(`✅ Navegador para '${sessionName}' iniciado y guardado.`);
    return browser;
  }

  async createPage(sessionName: string): Promise<puppeteer.Page> {
    const browser = this.browsers.get(sessionName);
    if (!browser) {
      throw new Error(`El navegador para la sesión '${sessionName}' no se ha iniciado. Llama a launchBrowser primero.`);
    }

    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    await page.setDefaultTimeout(60000);
    await page.setDefaultNavigationTimeout(60000);

    return page;
  }

  async closeBrowser(sessionName: string): Promise<void> {
    const browser = this.browsers.get(sessionName);
    if (browser) {
      await browser.close();
      this.browsers.delete(sessionName);
      this.logger.log(`🔌 Navegador para la sesión '${sessionName}' cerrado.`);
    }
  }

  createProfileDir(sessionName: string): string {
    const profilePath = path.join(process.cwd(), 'profiles', sessionName);
    
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
      this.logger.log(`📁 Directorio de perfil para '${sessionName}' creado.`);
      
      // Crear directorio Default
      const defaultPath = path.join(profilePath, 'Default');
      if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
      }
      
      // Crear archivo de preferencias
      const preferencesFile = path.join(defaultPath, 'Preferences');
      const preferences = {
        profile: {
          exit_type: 'Normal',
          exited_cleanly: true
        }
      };
      
      fs.writeFileSync(preferencesFile, JSON.stringify(preferences, null, 2));
      this.logger.log(`✅ Preferencias configuradas para evitar popup de restore.`);
    }
    
    // Limpiar archivo SingletonLock si existe
    const singletonLockPath = path.join(profilePath, 'SingletonLock');
    if (fs.existsSync(singletonLockPath)) {
      try {
        fs.unlinkSync(singletonLockPath);
        this.logger.log(`🧹 SingletonLock eliminado.`);
      } catch (error) {
        this.logger.warn(`⚠️ No se pudo eliminar SingletonLock.`);
      }
    }
    
    return profilePath;
  }
}