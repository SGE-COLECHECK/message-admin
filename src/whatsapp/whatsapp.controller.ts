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

  @Post(':accountId/class-attendance-report')
  async sendClassAttendanceReport(
    @Param('accountId') accountId: string,
    @Body() body: any, // RECOMENDACIÓN: Crear un DTO (p.ej. ClassAttendanceReportDto) para validar el body
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

    this.logger.log(`Recibida solicitud de reporte de asistencia por clase para la cuenta '${accountId}'.`);
    try {
      // Llama al nuevo método en el servicio
      const result = await whatsappService.sendClassAttendanceReport(body);
      return {
        statusCode: HttpStatus.OK,
        message: 'Reporte de asistencia por clase procesado con éxito.',
        data: result,
      };
    } catch (error) {
      // Reutiliza el manejador de errores existente
      this.handleError(error);
    }
  }

  @Post(':accountId/ping-whatsapp')
  async pingWhatsapp(
    @Param('accountId') accountId: string,
    @Body() body: { phoneNumber: string },
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

    const { phoneNumber } = body;
    const now = new Date();
    const message =
      `✅ *Bot activo*\n\n` +
      `📅 Fecha: *${now.toLocaleDateString('es-PE')}*\n` +
      `⏰ Hora: *${now.toLocaleTimeString('es-PE')}*\n` +
      `🤖 Sistema de notificaciones listo.`;

    try {
      // El método sendClassAttendanceReport es genérico y puede usarse aquí
      await whatsappService.sendClassAttendanceReport({ destinatario: { telefono: phoneNumber }, message });
      return { status: 'ok', sentTo: phoneNumber };
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