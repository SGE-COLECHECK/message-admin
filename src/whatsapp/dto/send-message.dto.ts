import { IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';

export class SendMessageDto {
  @IsNotEmpty()
  @IsPhoneNumber('PE')
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}