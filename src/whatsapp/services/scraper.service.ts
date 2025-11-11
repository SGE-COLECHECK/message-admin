import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'puppeteer';
import { SendAssistanceDto } from '../dto/send-assistance.dto';
import { QueueService } from './queue.service';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(private readonly queueService: QueueService) {}

  async sendMessage(phoneNumber: string, message: string, sessionName: string): Promise<string> {
    this.logger.log(`📤 Agregando mensaje a cola para ${phoneNumber} en sesión '${sessionName}'`);
    
    const queueId = await this.queueService.addToQueue(sessionName, phoneNumber, message);
    
    return queueId;
  }

  async sendAssistanceReport(reportData: SendAssistanceDto, sessionName: string): Promise<string> {
    const { student, time_assistance, type_assistance, phoneNumber, communicated } = reportData;
    const registro = type_assistance === 'entrance' ? 'ENTRADA' : 'SALIDA';
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    let message = `🚨🇨​​​🇴​​​​​🇱​​​​​🇪✅[ ${formattedDate} ]🚨

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

    this.logger.log('📄 Mensaje construido para cola');
    return await this.sendMessage(phoneNumber, message, sessionName);
  }
}