import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class SendAssistanceDto {
  @IsString()
  student: string;

  @IsString()
  time_assistance: string;

  @IsString()
  type_assistance: 'entrance' | 'exit'; // Más específico

  @IsString()
  phoneNumber: string;

  // --- NUEVOS CAMPOS ---
  @IsOptional() // Hacemos el campo opcional por si no siempre se envía
  @IsBoolean()
  classroom: boolean;

  @IsOptional()
  @IsBoolean()
  isCommunicated: boolean;

  @IsOptional()
  @IsString()
  communicated: string;
}