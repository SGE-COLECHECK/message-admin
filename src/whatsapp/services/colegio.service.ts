import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface Colegio {
  colegioId: string;
  colegioName: string;
  phoneNumber: string;
  createdAt: string;
  isAuthenticated: boolean;
}

@Injectable()
export class ColegioService {
  private readonly logger = new Logger(ColegioService.name);
  private readonly dataPath = path.join(process.cwd(), 'data', 'colegios.json');
  private colegios = new Map<string, Colegio>();

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dataPath)) {
        const raw = fs.readFileSync(this.dataPath, 'utf-8');
        const data = JSON.parse(raw) as Colegio[];
        data.forEach(c => this.colegios.set(c.colegioId, c));
        this.logger.log(`✅ ${data.length} colegio(s) cargado(s) desde disk`);
      }
    } catch (err) {
      this.logger.error(`Error cargando colegios desde disk: ${err.message}`);
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.colegios.values());
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
      this.logger.log(`💾 ${data.length} colegio(s) guardado(s) en disk`);
    } catch (err) {
      this.logger.error(`Error guardando colegios a disk: ${err.message}`);
    }
  }

  createColegio(colegioId: string, colegioName: string, phoneNumber: string): Colegio {
    if (this.colegios.has(colegioId)) {
      throw new Error(`Colegio ${colegioId} ya existe`);
    }

    const colegio: Colegio = {
      colegioId,
      colegioName,
      phoneNumber,
      createdAt: new Date().toISOString(),
      isAuthenticated: false,
    };

    this.colegios.set(colegioId, colegio);
    this.saveToDisk();
    this.logger.log(`🎓 Colegio '${colegioId}' (${colegioName}) registrado`);
    return colegio;
  }

  findById(colegioId: string): Colegio | null {
    return this.colegios.get(colegioId) || null;
  }

  getAll(): Colegio[] {
    return Array.from(this.colegios.values());
  }

  setAuthenticated(colegioId: string): void {
    const colegio = this.colegios.get(colegioId);
    if (colegio) {
      colegio.isAuthenticated = true;
      this.saveToDisk();
      this.logger.log(`✅ Colegio '${colegioId}' marcado como autenticado`);
    }
  }

  updatePhoneNumber(colegioId: string, phoneNumber: string): Colegio {
    const colegio = this.colegios.get(colegioId);
    if (!colegio) {
      throw new Error(`Colegio ${colegioId} no encontrado`);
    }
    colegio.phoneNumber = phoneNumber;
    this.saveToDisk();
    this.logger.log(`📱 Número de teléfono actualizado para '${colegioId}': ${phoneNumber}`);
    return colegio;
  }
}
