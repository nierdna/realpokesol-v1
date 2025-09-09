import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MatchmakingService } from './matchmaking.service';
import { UserModule } from '../user/user.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [ConfigModule, UserModule, StorageModule],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
