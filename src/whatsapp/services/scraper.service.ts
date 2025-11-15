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
   * Genera una versión aleatoria del mensaje con negritas y alineación perfecta.
   * @param reportData Datos del reporte.
   * @returns El string del mensaje generado.
   */
  private generateRandomMessage(reportData: SendAssistanceDto): string {
    const { student, time_assistance, type_assistance, communicated } = reportData;
    const registro = type_assistance === 'entrance' ? 'ENTRADA' : 'SALIDA';
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // >>> ENCABEZADO FIJO <<<
    const header = `🚨🇨​​​🇴​​​​​🇱​​​​​🇪✅[ ${formattedDate} ]🚨`;

    // --- Función auxiliar para alinear texto ---
    // Añade espacios para que todas las líneas tengan la misma longitud visual
    const alignLine = (label: string, value: string, totalLength: number = 25): string => {
      // Usamos un espacio normal y un espacio sin ruptura (\u00A0) para asegurar la alineación
      const spacesNeeded = totalLength - label.length - value.length;
      const padding = ' \u00A0'.repeat(Math.max(0, spacesNeeded));
      return `*${label}*:${padding}${value}`;
    };

    // Plantilla 1: El Mensaje Original (con alineación perfecta)
    const originalBody = `📝 *Reporte Diario*
➖➖➖➖➖➖➖➖
 ${alignLine('🎓 Estudiante▫️', student.toUpperCase())}
 ${alignLine('⏰ Hora de Registro▫️', time_assistance)}
 ${alignLine('📍 Ubicación▫️', 'Puerta')}
 ${alignLine('Registro', registro)}
➖➖➖➖➖➖➖➖`;

    // Plantilla 2: Versión Corta y Directa (con alineación)
    const shortBody = `🚨 *REGISTRO DE ${registro}*
➖➖➖➖➖➖➖➖
 ${alignLine('🎓 Estudiante▫️', student.toUpperCase())}
 ${alignLine('📍 Ubicación▫️', 'Puerta')}
 ${alignLine('⏰ Hora▫️', time_assistance)}
➖➖➖➖➖➖➖➖`;

    // Plantilla 3: Versión Minimalista (con alineación)
    const minimalBody = `🚨 *${registro} REGISTRADA*
➖➖➖➖➖➖
 ${alignLine('🎓 Estudiante▫️', student.toUpperCase())}
 ${alignLine('⏰ Detalles▫️', `📍 Puerta | ${time_assistance}`)}
➖➖➖➖➖➖`;

    // Elegimos una plantilla de cuerpo al azar
    const bodies = [originalBody, shortBody, minimalBody];
    const randomIndex = Math.floor(Math.random() * bodies.length);
    let selectedBody = bodies[randomIndex];

    // Añadimos el comunicado y el pie de página
    if (communicated) {
      selectedBody += `\n\n${alignLine('Comunicado', communicated)}`;
    }
    selectedBody += `\n\n✨ ¡Gracias por su apoyo! 🙂 ✨`;
    
    // Combinamos el encabezado fijo con el cuerpo aleatorio
    return `${header}\n\n${selectedBody}`;
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