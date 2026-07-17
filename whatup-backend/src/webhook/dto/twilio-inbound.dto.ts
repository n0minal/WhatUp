import { IsNotEmpty, IsString } from 'class-validator';

/**
 * The subset of Twilio's inbound-SMS webhook parameters this system uses.
 * Twilio posts application/x-www-form-urlencoded with PascalCase keys.
 */
export class TwilioInboundDto {
  @IsString()
  @IsNotEmpty()
  MessageSid!: string;

  @IsString()
  @IsNotEmpty()
  From!: string;

  @IsString()
  @IsNotEmpty()
  To!: string;

  @IsString()
  Body!: string;
}
