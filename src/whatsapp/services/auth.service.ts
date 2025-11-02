import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'puppeteer';
import * as fs from 'fs';
import { BrowserService } from './browser.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  
  constructor(private readonly browserService: BrowserService) {}

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async createSessionAndGoToWhatsApp(sessionName: string): Promise<{ page: Page; isAuthenticated: boolean }> {
    const profilePath = this.browserService.createProfileDir(sessionName);
    await this.browserService.launchBrowser(sessionName, profilePath);
    const page = await this.browserService.createPage(sessionName);

    this.logger.log('🌐 Navegando a WhatsApp Web...');
    await page.goto('https://web.whatsapp.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await this.sleep(5000);

    this.logger.log('🔍 Verificando si la sesión ya está activa...');
    const isAlreadyAuthenticated = await this.checkAuthStatus(page);

    if (isAlreadyAuthenticated) {
      this.logger.log('✅ Sesión ya estaba activa. No se necesita QR.');
      return { page, isAuthenticated: true };
    }

    this.logger.log('⏳ Sesión no activa. Procediendo a generar QR...');
    return { page, isAuthenticated: false };
  }

  async checkAuthStatus(page: Page): Promise<boolean> {
    try {
      await this.sleep(2000);
      
      // Buscar texto característico de WhatsApp Web logueado
      const authCheck = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const hasChatsText = bodyText.includes('Buscar un chat') || 
                           bodyText.includes('Todos') || 
                           bodyText.includes('No leídos') ||
                           bodyText.includes('Favoritos') ||
                           bodyText.includes('Grupos');
        
        const qrCanvas = document.querySelector('canvas[aria-label*="Scan"]');
        const hasChats = !!document.querySelector('[data-testid="chat-list"]');
        const hasHeader = !!document.querySelector('header[data-testid="chatlist-header"]');
        const noQrCanvas = !qrCanvas;
        const hasMainLayout = !!document.querySelector('div#app > div > div > div');
        
        return {
          hasQR: !!qrCanvas,
          hasChatsText,
          hasChats,
          hasHeader,
          isAuthenticated: hasChatsText || hasChats || hasHeader || (noQrCanvas && hasMainLayout)
        };
      });

      this.logger.log('🔍 Estado:', JSON.stringify(authCheck, null, 2));

      if (authCheck.hasQR) {
        this.logger.log('🔍 Se encontró un canvas de QR. El usuario NO está autenticado.');
        return false;
      }

      if (authCheck.isAuthenticated) {
        this.logger.log('🔍 Usuario autenticado correctamente.');
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Error al verificar autenticación:', error);
      return false;
    }
  }

  async getQrCode(page: Page): Promise<string> {
    this.logger.log('⏳ Esperando el código QR...');
    await page.waitForSelector('canvas[aria-label*="Scan"]', { visible: true, timeout: 60000 });
    
    const qrCodeDataUrl = await page.$eval('canvas[aria-label*="Scan"]', (canvas: HTMLCanvasElement) => {
      return canvas.toDataURL('image/png');
    });

    this.logger.log('✅ QR extraído exitosamente.');
    return qrCodeDataUrl;
  }

  async waitForAuthentication(page: Page): Promise<void> {
    this.logger.log('⏳ Esperando autenticación (hasta 2 minutos)...');
    
    try {
      // Esperar a que DESAPAREZCA el QR Y aparezca contenido de WhatsApp
      await page.waitForFunction(
        () => {
          const bodyText = document.body.innerText;
          const hasChatsText = bodyText.includes('Buscar un chat') || 
                             bodyText.includes('Todos') || 
                             bodyText.includes('No leídos');
          
          const qrCanvas = document.querySelector('canvas[aria-label*="Scan"]');
          const hasChats = !!document.querySelector('[data-testid="chat-list"]');
          const hasHeader = !!document.querySelector('header[data-testid="chatlist-header"]');
          const noQR = !qrCanvas;
          const hasMainLayout = !!document.querySelector('div#app > div > div > div');
          
          // Autenticado si: tiene texto de chats O tiene elementos de chat O (no hay QR Y hay layout)
          return hasChatsText || hasChats || hasHeader || (noQR && hasMainLayout);
        },
        { timeout: 120000, polling: 1000 }
      );

      // Dar tiempo adicional para que termine de cargar
      await this.sleep(3000);

      // Verificar una vez más
      const finalCheck = await this.checkAuthStatus(page);
      
      if (finalCheck) {
        this.logger.log('🎉 ¡Autenticación exitosa!');
      } else {
        throw new Error('La autenticación no se completó correctamente');
      }
      
    } catch (error) {
      this.logger.warn('⚠️ Timeout esperando autenticación.');
      
      const screenshotPath = 'auth-failed-screenshot.png';
      await page.screenshot({ path: screenshotPath, fullPage: true });
      this.logger.log(`📸 Screenshot guardado en ${screenshotPath}`);
      
      throw new Error('No se pudo completar la autenticación. Timeout esperando.');
    }
  }

  async closeBrowserForSession(sessionName: string): Promise<void> {
    await this.browserService.closeBrowser(sessionName);
    this.logger.log(`Solicitud de cierre de navegador para la sesión '${sessionName}' enviada.`);
  }
}