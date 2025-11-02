import { Controller, Get, Post, Body, Param, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SessionManagerService } from './services/session-manager.service';
import { AuthService } from './services/auth.service';
import { ScraperService } from './services/scraper.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendAssistanceDto } from './dto/send-assistance.dto';
import { Session } from './interfaces/session.interface';
@Controller('whatsapp')
export class WhatsappController {

   private readonly logger = new Logger(WhatsappController.name);
  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly authService: AuthService, // <-- Inyectamos AuthService
    private readonly scraperService: ScraperService,
  ) {}

 @Post('sessions')
  async createSession(@Body() createSessionDto: CreateSessionDto) {
    const { name } = createSessionDto;
    if (this.sessionManager.get(name)) {
      throw new HttpException(`La sesión '${name}' ya existe.`, HttpStatus.CONFLICT);
    }

    try {
      // <-- CAMBIO CLAVE: Ahora obtenemos el estado de autenticación desde aquí
      const { page, isAuthenticated } = await this.authService.createSessionAndGoToWhatsApp(name);

      const session: Session = { 
        name, 
        page, 
        isAuthenticated, // <-- Usamos el valor que nos devolvió el servicio
        profilePath: '' 
      };
      this.sessionManager.set(session);

      if (isAuthenticated) {
        // Si ya estaba logueado, devolvemos éxito sin QR.
        return { message: `Sesión '${name}' recuperada con éxito. Ya estás autenticado.`, isAuthenticated: true, qrCode: null };
      }

      // Si no estaba logueado, procedemos con el flujo del QR.
      try {
        const qrCode = await this.authService.getQrCode(page);
        session.qrCode = qrCode;
        // Iniciar espera de autenticación en segundo plano
        this.authService.waitForAuthentication(page).then(() => {
          this.sessionManager.setAuthenticated(name);
        }).catch(err => {
          this.logger.warn(`La autenticación para ${name} falló o expiró: ${err.message}`);
        });
        return { message: `Sesión '${name}' creada. Escanea el QR.`, isAuthenticated: false, qrCode };
      } catch (error) {
        this.sessionManager.remove(name);
        throw new HttpException({ message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } catch (error) {
      throw new HttpException({ message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('sessions/:name/qr')
  async getQr(@Param('name') name: string) {
    const session = this.sessionManager.get(name);
    if (!session) throw new HttpException('Sesión no encontrada.', HttpStatus.NOT_FOUND);
    
    if (session.isAuthenticated) {
      return { message: 'Sesión ya autenticada.', isAuthenticated: true, qrCode: null };
    }
    
    return { message: 'Esperando autenticación.', isAuthenticated: false, qrCode: session.qrCode };
  }

  @Post('sessions/:name/send-assistance-report')
  async sendReport(@Param('name') name: string, @Body() reportData: SendAssistanceDto) {
    const session = this.sessionManager.get(name);
    if (!session || !session.isAuthenticated) {
      throw new HttpException('Sesión no encontrada o no autenticada.', HttpStatus.BAD_REQUEST);
    }
    await this.scraperService.sendAssistanceReport(session.page, reportData);
    return { success: true, message: 'Reporte enviado.' };
  }
  
  @Post('sessions/:name/logout')
  async logout(@Param('name') name: string) {
    // 1. Cerrar el navegador para esa sesión
    await this.authService.closeBrowserForSession(name); // Necesitamos crear este método en AuthService
    // 2. Eliminar la sesión del SessionManager
    this.sessionManager.remove(name);
    // 3. Opcional: Borrar la carpeta del perfil
    // ... (lógica para borrar carpeta)
    return { message: `Sesión '${name}' cerrada.` };
  }
}