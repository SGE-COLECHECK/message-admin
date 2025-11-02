import { Injectable, Logger } from '@nestjs/common';
import { Session } from '../interfaces/session.interface';

@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);
  private readonly sessions = new Map<string, Session>();

  get(sessionName: string): Session | undefined {
    return this.sessions.get(sessionName);
  }

  set(session: Session): void {
    this.sessions.set(session.name, session);
    this.logger.log(`Sesión '${session.name}' guardada.`);
  }

  remove(sessionName: string): boolean {
    const result = this.sessions.delete(sessionName);
    if (result) {
      this.logger.log(`Sesión '${sessionName}' eliminada.`);
    }
    return result;
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }

  setAuthenticated(sessionName: string): void {
    const session = this.get(sessionName);
    if (session) {
      session.isAuthenticated = true;
      session.qrCode = undefined;
      this.logger.log(`Sesión '${sessionName}' marcada como autenticada.`);
    }
  }
}