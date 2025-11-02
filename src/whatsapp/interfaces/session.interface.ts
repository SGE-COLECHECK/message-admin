import { Page } from 'puppeteer';

export interface Session {
  name: string;             // Ej: 'soporte', 'ventas'
  page: Page;               // La pestaña de Puppeteer para esta sesión
  isAuthenticated: boolean;  // Estado de la sesión
  profilePath: string;      // Ruta a su carpeta de perfil
  qrCode?: string;          // El QR si está esperando login (opcional)
}