import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1600) // Twilio's long-message ceiling
  body!: string;
}

export class StartConversationDto extends SendMessageDto {
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phoneNumber must be E.164, e.g. +15551234567',
  })
  phoneNumber!: string;
}
