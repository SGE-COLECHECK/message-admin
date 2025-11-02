import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

import * as os from 'os';

function getServerIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(new ValidationPipe());
  
  // Servir archivos estáticos
  app.useStaticAssets(join(__dirname, '..', 'public'));

  const PORT = parseInt(process.env.PORT || '3000', 10);
  await app.listen(PORT, '0.0.0.0');

  const ip = getServerIp();
  logger.log(`* http://localhost:${PORT}`);
  logger.log(`* http://${ip}:${PORT}`);
}
bootstrap();