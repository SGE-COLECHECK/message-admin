import { IsString } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  name: string;
}