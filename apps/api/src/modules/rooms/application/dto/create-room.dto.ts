import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
