import { Controller, Get, Post, Body, Param, Delete, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SessionManagerService } from './services/session-manager.service';
import { AuthService } from './services/auth.service';
import { ScraperService } from './services/scraper.service';
import { QueueService } from './services/queue.service';
import { StatsService } from './services/stats.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendAssistanceDto } from './dto/send-assistance.dto';
import { Session } from './interfaces/session.interface';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);
  
  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly authService: AuthService,
    private readonly scraperService: ScraperService,
    private readonly queueService: QueueService,
  ) {}

  @Post('sessions')
  async createSession(@Body() createSessionDto: CreateSessionDto) {
    const { name } = createSessionDto;
    if (this.sessionManager.get(name)) {
      throw new HttpException(`La sesión '${name}' ya existe.`, HttpStatus.CONFLICT);
    }

    try {
      const { page, isAuthenticated } = await this.authService.createSessionAndGoToWhatsApp(name);

      const session: Session = { 
        name, 
        page, 
        isAuthenticated,
        profilePath: '' 
      };
      this.sessionManager.set(session);

      if (isAuthenticated) {
        return { 
          message: `Sesión '${name}' recuperada con éxito. Ya estás autenticado.`, 
          isAuthenticated: true, 
          qrCode: null 
        };
      }

      try {
        const qrCode = await this.authService.getQrCode(page);
        session.qrCode = qrCode;
        
        this.authService.waitForAuthentication(page).then(() => {
          this.sessionManager.setAuthenticated(name);
        }).catch(err => {
          this.logger.warn(`La autenticación para ${name} falló o expiró: ${err.message}`);
        });
        
        return { 
          message: `Sesión '${name}' creada. Escanea el QR.`, 
          isAuthenticated: false, 
          qrCode 
        };
      } catch (error) {
        this.sessionManager.remove(name);
        throw new HttpException({ message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } catch (error) {
      throw new HttpException({ message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('sessions')
  async listSessions() {
    const sessions = this.sessionManager.getAll();
    return {
      total: sessions.length,
      sessions: sessions.map(s => ({
        name: s.name,
        isAuthenticated: s.isAuthenticated,
        hasQR: !!s.qrCode
      }))
    };
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

  @Get('sessions/:name/status')
  async getSessionStatus(@Param('name') name: string) {
    const session = this.sessionManager.get(name);
    if (!session) {
      throw new HttpException('Sesión no encontrada.', HttpStatus.NOT_FOUND);
    }
    
    return {
      name: session.name,
      isAuthenticated: session.isAuthenticated,
      hasQR: !!session.qrCode
    };
  }

  @Post('sessions/:name/send-assistance-report')
  async sendReport(@Param('name') name: string, @Body() reportData: SendAssistanceDto) {
    const session = this.sessionManager.get(name);
    if (!session || !session.isAuthenticated) {
      throw new HttpException('Sesión no encontrada o no autenticada.', HttpStatus.BAD_REQUEST);
    }
    
    const queueId = await this.scraperService.sendAssistanceReport(reportData, name);
    
    return { 
      success: true, 
      message: 'Mensaje agregado a la cola de Redis',
      queueId 
    };
  }
  
  // ✅ ENDPOINTS DE COLA
  @Get('queues')
  async getAllQueuesStatus() {
    return this.queueService.getAllQueuesStatus();
  }

  @Get('queues/:name')
  async getQueueStatus(@Param('name') name: string) {
    return this.queueService.getQueueStatus(name);
  }

  @Delete('queues/:name')
  async clearQueue(@Param('name') name: string) {
    await this.queueService.clearQueue(name);
    return { message: `Cola '${name}' limpiada` };
  }

  @Get('queues/:name/errors')
  async getQueueErrors(@Param('name') name: string) {
    const errors = await this.queueService.getErrors(name);
    return {
      sessionName: name,
      totalErrors: errors.length,
      errors
    };
  }

  @Post('sessions/:name/logout')
  async logout(@Param('name') name: string) {
    await this.authService.closeBrowserForSession(name);
    this.sessionManager.remove(name);
    await this.queueService.clearQueue(name);
    return { message: `Sesión '${name}' cerrada y cola limpiada.` };
  }
}