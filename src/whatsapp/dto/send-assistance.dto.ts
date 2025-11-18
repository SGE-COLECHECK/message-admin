import { IsString, IsBoolean, IsOptional, IsIn } from 'class-validator';

export class SendAssistanceDto {
  @IsString()
  time_assistance: string;

  @IsString()
  student: string;

  @IsString()
  phoneNumber: string;

  @IsIn(['entrance', 'exit'])
  type_assistance: 'entrance' | 'exit';

  @IsOptional()
  @IsBoolean()
  classroom?: boolean;

  @IsOptional()
  @IsBoolean()
  isCommunicated?: boolean;

  @IsOptional()
  @IsString()
  communicated?: string;
}