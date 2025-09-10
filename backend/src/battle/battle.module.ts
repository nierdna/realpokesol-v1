import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BattleService } from './battle.service';
import { UserModule } from '../user/user.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [ConfigModule, UserModule, StorageModule],
  providers: [BattleService],
  exports: [BattleService],
})
export class BattleModule {}
