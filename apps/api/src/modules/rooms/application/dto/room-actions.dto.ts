import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class JoinRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayName?: string;
}

export class AddQueueTrackDto {
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  youtubeVideoId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  artist!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  album?: string;

  @IsInt()
  @Min(1_000)
  @Max(600_000)
  durationMs!: number;
}

export class CastVoteDto {
  @IsString()
  @MinLength(1)
  queueItemId!: string;
}

export class SendTextMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content!: string;
}

export class AdvancePlaybackDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  positionMs?: number;
}
