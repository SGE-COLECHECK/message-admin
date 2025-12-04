import { registerAs } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface WhatsappAccount {
  id: string;
  description: string;
  debuggingPort: number;
  profilePath: string;
}

export default registerAs('whatsappAccounts', (): WhatsappAccount[] => {
  const configPath = path.resolve(process.cwd(), 'browsers.config.json');

  if (!fs.existsSync(configPath)) {
    console.error(
      '❌ Error: browsers.config.json not found in project root. WhatsApp accounts cannot be loaded.',
    );
    return [];
  }

  try {
    const configFile = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configFile);

    if (!config.accounts || !Array.isArray(config.accounts)) {
      console.error(
        '❌ Error: Invalid format in browsers.config.json. "accounts" array is missing.',
      );
      return [];
    }

    // Filter enabled accounts and map to WhatsappAccount interface
    const accounts: WhatsappAccount[] = config.accounts
      .filter((acc: any) => acc.enabled)
      .map((acc: any) => ({
        id: acc.id,
        description: acc.description,
        debuggingPort: acc.debuggingPort,
        // Construct profile path dynamically based on OS (assuming Linux/Docker environment for the backend usually, but keeping it generic or based on the config if needed)
        // The original static config had hardcoded paths like '/root/message-admin/profiles/...'
        // We should probably respect what the start-browsers script does or use a standard path.
        // The start-browsers.js uses: path.join(os.homedir(), 'message-admin', 'profiles', id)
        // Let's try to replicate that or use a configured path.
        // For now, let's construct it relative to the home directory to be safe and consistent with start-browsers.js
        profilePath: path.join(
          process.env.HOME || '/root',
          'message-admin',
          'profiles',
          acc.id,
        ),
      }));

    return accounts;
  } catch (error) {
    console.error('❌ Error parsing browsers.config.json:', error);
    return [];
  }
});