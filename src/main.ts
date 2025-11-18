import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Habilita la validación automática de DTOs en toda la aplicación
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Elimina propiedades no definidas en el DTO
    transform: true, // Transforma el payload al tipo del DTO
  }));

  // Habilita CORS para que puedas hacer peticiones desde otros orígenes si es necesario
  app.enableCors();

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`🚀 Application is running on: ${await app.getUrl()}`);
}
bootstrap();