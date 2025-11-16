import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateColegioDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  colegioId: string; // ej: 'default', 'colegio-abc', 'ie-independencia'

  @IsString()
  @IsNotEmpty()
  colegioName: string; // ej: 'Colegio ABC', 'IE Independencia'

  @IsString()
  @IsNotEmpty()
  phoneNumber: string; // ej: '51987654321' (número de WhatsApp del colegio)
}
