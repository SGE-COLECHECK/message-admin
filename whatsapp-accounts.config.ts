import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface WhatsappAccount {
  id: string;
  description: string;
  debuggingPort: number;
  profilePath: string;
}

interface BrowserConfig {
  headless: boolean;
  browserExecutable: {
    linux: string;
    windows: string;
  };
  accounts: Array<{
    id: string;
    description: string;
    debuggingPort: number;
    enabled: boolean;
  }>;
}

export default registerAs('whatsappAccounts', (): WhatsappAccount[] => {
  try {
    // Leer el archivo browsers.config.json desde la raíz del proyecto
    const configPath = join(process.cwd(), 'browsers.config.json');
    const configFile = readFileSync(configPath, 'utf-8');
    const config: BrowserConfig = JSON.parse(configFile);

    // Filtrar solo las cuentas habilitadas y mapear al formato esperado
    const enabledAccounts = config.accounts
      .filter((account) => account.enabled === true)
      .map((account) => ({
        id: account.id,
        description: account.description,
        debuggingPort: account.debuggingPort,
        profilePath: `${process.env.HOME}/message-admin/profiles/${account.id}`,
      }));

    if (enabledAccounts.length === 0) {
      console.warn(
        '⚠️  ADVERTENCIA: No hay cuentas habilitadas en browsers.config.json',
      );
    } else {
      console.log(
        `✅ Cargadas ${enabledAccounts.length} cuenta(s) habilitada(s) desde browsers.config.json`,
      );
    }

    return enabledAccounts;
  } catch (error) {
    console.error(
      '❌ Error al leer browsers.config.json:',
      error instanceof Error ? error.message : error,
    );
    console.error(
      '   Asegúrate de que el archivo existe en la raíz del proyecto.',
    );
    // Retornar array vacío en caso de error para evitar que la app crashee
    return [];
  }
});