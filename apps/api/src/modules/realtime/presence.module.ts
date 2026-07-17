import { Global, Module } from '@nestjs/common';
import { RoomPresenceService } from './application/room-presence.service';

/** Shared live-presence store — independent of RoomsModule to avoid cycles. */
@Global()
@Module({
  providers: [RoomPresenceService],
  exports: [RoomPresenceService],
})
export class PresenceModule {}
