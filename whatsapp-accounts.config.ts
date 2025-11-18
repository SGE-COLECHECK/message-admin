import { registerAs } from '@nestjs/config';

export interface WhatsappAccount {
  id: string;
  description: string;
  debuggingPort: number;
  profilePath: string;
}

export default registerAs(
  'whatsappAccounts',
  (): WhatsappAccount[] => [
    {
      id: 'ieguillermo',
      description: 'Colegio IE Guillermo',
      debuggingPort: 9222,
      profilePath: `${process.env.HOME}/message-admin/profiles/ieguillermo`,
    },
    {
      id: 'ieindependencia',
      description: 'Colegio IE Independencia',
      debuggingPort: 9223, // Puerto diferente para la segunda cuenta
      profilePath: `${process.env.HOME}/message-admin/profiles/ieindependencia`,
    },
    // Puedes añadir más cuentas aquí
  ],
);