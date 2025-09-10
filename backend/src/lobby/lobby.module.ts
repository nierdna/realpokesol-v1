import { Module } from '@nestjs/common';
import { LobbyService } from './lobby.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  providers: [LobbyService],
  exports: [LobbyService],
})
export class LobbyModule {}
