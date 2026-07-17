import { Module } from '@nestjs/common';
import { GuestsModule } from '../guests/guests.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RoomBroadcastService } from './application/room-broadcast.service';
import { RoomSyncService } from './application/room-sync.service';
import { PresenceModule } from './presence.module';
import { RoomsGateway } from './presentation/rooms.gateway';

@Module({
  imports: [RoomsModule, GuestsModule, PresenceModule],
  providers: [RoomSyncService, RoomBroadcastService, RoomsGateway],
  exports: [RoomSyncService, RoomBroadcastService],
})
export class RealtimeModule {}
