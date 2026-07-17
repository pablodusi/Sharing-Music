import { Module } from '@nestjs/common';
import { GuestsModule } from '../guests/guests.module';
import { RoomsService } from './application/rooms.service';
import { RoomsRepository } from './infrastructure/rooms.repository';
import { VoiceStorageService } from './infrastructure/voice-storage.service';
import { RoomsController } from './presentation/rooms.controller';

@Module({
  imports: [GuestsModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsRepository, VoiceStorageService],
  exports: [RoomsService, RoomsRepository],
})
export class RoomsModule {}
