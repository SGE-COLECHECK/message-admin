import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'puppeteer';
import { SendAssistanceDto } from '../dto/send-assistance.dto';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendMessage(page: Page, phoneNumber: string, message: string): Promise<void> {
    this.logger.log(`📤 Enviando mensaje a ${phoneNumber}...`);
    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('51')) formattedPhone = '51' + formattedPhone;

    // 1. Buscar el cuadro de búsqueda
    this.logger.log('🔍 Buscando cuadro de búsqueda...');
    const searchBox = await page.$('div[contenteditable="true"][data-tab="3"]');
    if (!searchBox) {
      await page.screenshot({ path: 'error-no-searchbox.png' });
      throw new Error('No se encontró el cuadro de búsqueda.');
    }
    
    // 2. Hacer clic y limpiar
    this.logger.log('🖱️ Limpiando buscador...');
    await searchBox.click();
    await this.sleep(500);
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await this.sleep(300);
    
    // 3. Escribir número y abrir chat
    this.logger.log(`⌨️ Escribiendo número: ${formattedPhone}`);
    await page.type('div[contenteditable="true"][data-tab="3"]', formattedPhone, { delay: 100 });
    await this.sleep(2000);
    
    this.logger.log('⏎ Abriendo chat...');
    await page.keyboard.press('Enter');
    await this.sleep(3000); // Más tiempo para que cargue el chat

    // 4. Esperar el cuadro de mensaje
    this.logger.log('✍️ Esperando cuadro de mensaje...');
    try {
      await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 10000 });
    } catch (error) {
      await page.screenshot({ path: 'error-no-messagebox.png' });
      throw new Error('No se encontró el cuadro de mensaje después de 10 segundos.');
    }

    const messageBox = await page.$('div[contenteditable="true"][data-tab="10"]');
    if (!messageBox) {
      await page.screenshot({ path: 'error-messagebox-null.png' });
      throw new Error('El cuadro de mensaje es null.');
    }
    
    // 5. Hacer clic en el cuadro de mensaje
    this.logger.log('🖱️ Haciendo clic en cuadro de mensaje...');
    await messageBox.click();
    await this.sleep(500);

    // 6. Escribir mensaje línea por línea con Shift+Enter
    this.logger.log('📝 Escribiendo mensaje con saltos de línea...');
    const lines = message.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Escribir la línea actual (solo si tiene contenido)
      if (line.length > 0) {
        await page.type('div[contenteditable="true"][data-tab="10"]', line, { delay: 20 });
      }
      
      // Si no es la última línea, presionar Shift+Enter
      if (i < lines.length - 1) {
        await page.keyboard.down('Shift');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Shift');
        await this.sleep(50);
      }
    }

    await this.sleep(500);
    
    // 7. Tomar screenshot antes de enviar (para debug)
    await page.screenshot({ path: 'antes-de-enviar.png' });
    this.logger.log('📸 Screenshot tomado: antes-de-enviar.png');

    // 8. Enviar mensaje
    this.logger.log('📮 Enviando mensaje...');
    await page.keyboard.press('Enter');
    await this.sleep(2000);
    
    this.logger.log('✅ Mensaje enviado correctamente');
  }

  async sendAssistanceReport(page: Page, reportData: SendAssistanceDto): Promise<void> {
    const { student, time_assistance, type_assistance, phoneNumber, communicated } = reportData;

    const registro = type_assistance === 'entrance' ? 'ENTRADA' : 'SALIDA';
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // Construir mensaje con \n normal
    let message = `🚨🇨​​​​​🇴​​​​​🇱​​​​​🇪✅  [ ${formattedDate} ]🚨

📝 Reporte Diario
➖➖➖➖➖➖➖➖➖
🎓 *Estudiante*: ▫️${student.toUpperCase()}
⏰ *Hora de Registro*: ▫️${time_assistance}
📍 *Ubicación*: ▫️Puerta
✅  *Registro*: ▫️${registro}
➖➖➖➖➖➖➖➖➖`;

    if (communicated) {
      message += `\n\n📢 *Comunicado*: ${communicated}`;
    }

    message += `\n\n✨ ¡Gracias por su apoyo! 🙂 ✨`;

    this.logger.log('📄 Mensaje a enviar:');
    this.logger.log(message);

    await this.sendMessage(page, phoneNumber, message);
  }
}