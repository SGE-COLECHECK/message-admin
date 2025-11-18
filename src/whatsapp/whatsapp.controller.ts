import { Controller, Post, Body, HttpStatus, HttpException, Logger, Param } from '@nestjs/common';

import { SendAssistanceDto } from './dto/send-assistance.dto';
import { WhatsappAccountManager } from './whatsapp-account.manager';

@Controller('wapp-web')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly accountManager: WhatsappAccountManager) {}

  @Post(':accountId/senddReport')
  async sendReport(
    @Param('accountId') accountId: string,
    @Body() reportData: SendAssistanceDto,
  ) {
    const whatsappService = this.accountManager.getAccount(accountId);
    if (!whatsappService) {
      throw new HttpException(`La cuenta '${accountId}' no existe o no está configurada.`, HttpStatus.NOT_FOUND);
    }

    if (!whatsappService.isReady()) {
      throw new HttpException(
        `El servicio de WhatsApp para la cuenta '${accountId}' no está listo. Por favor, inténtelo más tarde.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.log(`Recibida solicitud de reporte para: ${reportData.student}`);
    try {
      const result = await whatsappService.sendAssistanceReport(reportData);
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