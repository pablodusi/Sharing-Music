import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentGuest } from '../../../common/decorators/current-guest.decorator';
import { GuestIdentityGuard } from '../../../common/guards/guest-identity.guard';
import { GuestIdentity } from '../../../common/types/guest-identity.type';
import { CreateRoomDto } from '../application/dto/create-room.dto';
import {
  AddQueueTrackDto,
  CastVoteDto,
  SendTextMessageDto,
} from '../application/dto/room-actions.dto';
import { RoomsService } from '../application/rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  listPublicRooms() {
    return this.roomsService.listPublicRooms();
  }

  @Post()
  @UseGuards(GuestIdentityGuard)
  createRoom(
    @CurrentGuest() guest: GuestIdentity,
    @Body() dto: CreateRoomDto,
  ) {
    return this.roomsService.createRoom(guest, dto);
  }

  @Post(':id/join')
  @UseGuards(GuestIdentityGuard)
  async joinRoom(
    @Param('id') id: string,
    @CurrentGuest() guest: GuestIdentity,
  ) {
    const result = await this.roomsService.joinRoom(id, guest);
    return result.snapshot;
  }

  @Get(':id')
  @UseGuards(GuestIdentityGuard)
  getSnapshot(
    @Param('id') id: string,
    @CurrentGuest() guest: GuestIdentity,
  ) {
    return this.roomsService.getSnapshot(id, guest);
  }

  @Post(':id/queue')
  @UseGuards(GuestIdentityGuard)
  addToQueue(
    @Param('id') id: string,
    @CurrentGuest() guest: GuestIdentity,
    @Body() dto: AddQueueTrackDto,
  ) {
    return this.roomsService.addToQueue(id, guest, dto);
  }

  @Delete(':id/queue/:itemId')
  @UseGuards(GuestIdentityGuard)
  removeFromQueue(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentGuest() guest: GuestIdentity,
  ) {
    return this.roomsService.removeFromQueue(id, itemId, guest);
  }

  @Post(':id/votes')
  @UseGuards(GuestIdentityGuard)
  castVote(
    @Param('id') id: string,
    @CurrentGuest() guest: GuestIdentity,
    @Body() dto: CastVoteDto,
  ) {
    return this.roomsService.castVote(id, guest, dto.queueItemId);
  }

  @Post(':id/messages')
  @UseGuards(GuestIdentityGuard)
  sendText(
    @Param('id') id: string,
    @CurrentGuest() guest: GuestIdentity,
    @Body() dto: SendTextMessageDto,
  ) {
    return this.roomsService.sendTextMessage(id, guest, dto.content);
  }

  @Post(':id/messages/voice')
  @UseGuards(GuestIdentityGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  sendVoice(
    @Param('id') id: string,
    @CurrentGuest() guest: GuestIdentity,
    @UploadedFile() file: Express.Multer.File,
    @Body('durationMs', ParseIntPipe) durationMs: number,
  ) {
    return this.roomsService.sendVoiceMessage(id, guest, file, durationMs);
  }

  @Post(':id/playback/advance')
  @UseGuards(GuestIdentityGuard)
  async advancePlayback(
    @Param('id') id: string,
    @CurrentGuest() guest: GuestIdentity,
    @Body() body: { endingYoutubeVideoId?: string },
  ) {
    const result = await this.roomsService.advancePlayback(
      id,
      guest,
      body?.endingYoutubeVideoId,
    );
    return result.snapshot;
  }
}
