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

/**
 * Genera un mensaje de reporte de asistencia rápido y con un formato fijo.
 * @param reportData - Objeto con los datos del reporte.
 * @returns El string del mensaje formateado.
 */
private generateRandomMessage(reportData: SendAssistanceDto): string {
  const { student, time_assistance, type_assistance } = reportData;

  // --- Funciones auxiliares simples ---
  const formatDate = (date: Date): string => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

const abbreviateName = (fullName: string): string => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return '';

    // Asignamos cada parte del nombre
    const firstName = parts[0];
    const secondName = parts[1];
    const firstSurname = parts[2];
    const secondSurname = parts[3];

    // Empezamos con el primer nombre completo
    let result = firstName.toUpperCase();

    // Si hay segundo nombre, añadimos solo su inicial
    if (secondName) {
        result += ` ${secondName.charAt(0).toUpperCase()}.`;
    }

    // Si hay primer apellido, lo añadimos completo
    if (firstSurname) {
        result += ` ${firstSurname.toUpperCase()}`;
    }

    // Si hay segundo apellido, añadimos solo su inicial
    if (secondSurname) {
        result += ` ${secondSurname.charAt(0).toUpperCase()}.`;
    }

    return result;
};

  const formatTime = (time: string): string => time.substring(0, 5);

  // --- Construcción del mensaje ---
  const registro = type_assistance === 'entrance' ? 'ENTRADA' : 'SALIDA';
  const formattedDate = formatDate(new Date());
  const formattedTime = formatTime(time_assistance);
  const abbreviatedName = abbreviateName(student);

  // >>> CAMBIO 1: PON AQUÍ EL EMOJI QUE QUIERAS <<<
  const initialEmoji = '🚨'; // Reemplaza '🚨' por '📋', '🔔', o el que quieras

  const header = `${initialEmoji}🇨​​​​​🇴​​​​​🇱​​​​​🇪✅ [${formattedDate}]`;
  const separator = '➖➖➖➖➖➖➖➖➖➖';
  const studentLine = `🎓 *Estudiante:* ▫️ ${abbreviatedName}`;
  const timeLine = `⏰ *${registro}:* ▫️${formattedTime}`;

  // >>> CAMBIO 2: PON AQUÍ EL MENSAJE FINAL QUE QUIERAS <<<
  const footer = '✨ ¡Gracias por su apoyo! 🙂 ✨'; // Reemplaza esto por lo que quieras

  return `${header}\n${separator}\n${studentLine}\n${timeLine}\n${separator}\n${footer}`;
}

  async sendAssistanceReport(reportData: SendAssistanceDto, sessionName: string): Promise<string> {
    // 📊 TIMESTAMP: Inicio del proceso
    const startTime = Date.now();
    this.logger.log(`⏱️  [TIMING] Inicio de sendAssistanceReport: ${new Date().toLocaleTimeString()}`);
    
    const message = this.generateRandomMessage(reportData);

    this.logger.log('📄 Mensaje aleatorio construido para cola');
    const queueId = await this.sendMessage(reportData.phoneNumber, message, sessionName);
    
    // 📊 TIMESTAMP: Mensaje encolado
    const enqueuedTime = Date.now() - startTime;
    this.logger.log(`⏱️  [TIMING] Mensaje encolado en ${enqueuedTime}ms`);
    
    return queueId;
  }
}