import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);
  private readonly redisClient: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redisClient = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
    });
  }

  // ✅ Obtener clave para el contador diario
  private getDailyCounterKey(sessionName: string): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `stats:daily:${sessionName}:${today}`;
  }

  // ✅ Incrementar contador de mensajes enviados hoy
  async incrementDailyCounter(sessionName: string): Promise<number> {
    const key = this.getDailyCounterKey(sessionName);
    const count = await this.redisClient.incr(key);
    
    // Establecer expiración de 48 horas (para mantener el dato del día anterior)
    await this.redisClient.expire(key, 172800);
    
    return count;
  }

  // ✅ Obtener contador de mensajes de hoy
  async getDailyCounter(sessionName: string): Promise<number> {
    const key = this.getDailyCounterKey(sessionName);
    const count = await this.redisClient.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  // ✅ Obtener estadísticas completas de una sesión
  async getSessionStats(sessionName: string): Promise<any> {
    const dailyCount = await this.getDailyCounter(sessionName);
    
    // Obtener historial de los últimos 7 días
    const last7Days: Array<{ date: string; count: number }> = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const key = `stats:daily:${sessionName}:${dateStr}`;
      const count = await this.redisClient.get(key);
      last7Days.push({
        date: dateStr,
        count: count ? parseInt(count, 10) : 0
      });
    }

    return {
      sessionName,
      today: {
        date: new Date().toISOString().split('T')[0],
        count: dailyCount
      },
      last7Days
    };
  }

  // ✅ Obtener estadísticas de todas las sesiones
  async getAllSessionsStats(): Promise<any[]> {
    const keys = await this.redisClient.keys('stats:daily:*');
    const sessions = new Set<string>();
    
    keys.forEach(key => {
      const parts = key.split(':');
      if (parts.length >= 3) {
        sessions.add(parts[2]);
      }
    });

    const stats = await Promise.all(
      Array.from(sessions).map(sessionName => this.getSessionStats(sessionName))
    );

    return stats;
  }

  // ✅ Resetear contador de una sesión (útil para testing)
  async resetDailyCounter(sessionName: string): Promise<void> {
    const key = this.getDailyCounterKey(sessionName);
    await this.redisClient.del(key);
    this.logger.log(`Contador diario reseteado para ${sessionName}`);
  }
}