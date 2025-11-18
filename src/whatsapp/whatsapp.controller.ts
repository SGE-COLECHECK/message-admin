import { Controller, Post, Body, HttpStatus, HttpException, Logger } from '@nestjs/common';

import { SendAssistanceDto } from './dto/send-assistance.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('wapp-web')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('senddReport')
  async sendReport(@Body() reportData: SendAssistanceDto) {
    if (!this.whatsappService.isReady()) {
      throw new HttpException(
        'El servicio de WhatsApp no está listo. Por favor, inténtelo más tarde.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.log(`Recibida solicitud de reporte para: ${reportData.student}`);
    try {
      const result = await this.whatsappService.sendAssistanceReport(reportData);
      return {
        statusCode: HttpStatus.OK,
        message: 'Reporte procesado con éxito.',
        data: result,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: any) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    this.logger.error(`Error en el controlador: ${message}`);
    throw new HttpException(
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'No se pudo enviar el reporte de asistencia.',
        details: message,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}