import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
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

  // ---------------- File-backed session persistence per colegioId ----------------
  private profilePath(colegioId: string): string {
    return path.join(process.cwd(), 'profiles', colegioId);
  }

  async loadSession(colegioId: string): Promise<any[] | null> {
    const file = path.join(this.profilePath(colegioId), 'cookies.json');
    try {
      if (!fs.existsSync(file)) return null;
      const raw = await fs.promises.readFile(file, 'utf-8');
      return JSON.parse(raw) as any[];
    } catch (err) {
      this.logger.error(`Error cargando session cookies para ${colegioId}: ${err.message}`);
      return null;
    }
  }

  async saveSession(colegioId: string, cookies: any[]): Promise<void> {
    const dir = this.profilePath(colegioId);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'cookies.json');
      await fs.promises.writeFile(file, JSON.stringify(cookies, null, 2), 'utf-8');
      this.logger.log(`Cookies guardadas para ${colegioId} en ${file}`);
    } catch (err) {
      this.logger.error(`Error guardando cookies para ${colegioId}: ${err.message}`);
    }
  }

  async cleanupInactiveSessions(colegioId: string): Promise<void> {
    const dir = this.profilePath(colegioId);
    try {
      if (!fs.existsSync(dir)) return;
      // Remove heavy cache directories if present
      const cacheDirs = ['Cache', 'GPUCache', 'CacheStorage', 'Service Worker', 'ShaderCache'];
      for (const d of cacheDirs) {
        const p = path.join(dir, d);
        if (fs.existsSync(p)) {
          await fs.promises.rm(p, { recursive: true, force: true });
          this.logger.log(`🧹 Cache eliminado: ${p}`);
        }
      }
      // Remove singleton locks
      const lockFiles = ['SingletonLock', 'SingletonSocket', 'DevToolsActivePort'];
      for (const f of lockFiles) {
        const p = path.join(dir, f);
        if (fs.existsSync(p)) {
          try { await fs.promises.unlink(p); this.logger.log(`🧹 Eliminado: ${p}`); } catch (e) { /* ignore */ }
        }
      }
    } catch (err) {
      this.logger.error(`Error limpiando session ${colegioId}: ${err.message}`);
    }
  }
}