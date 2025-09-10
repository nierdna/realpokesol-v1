import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SocketGateway } from './socket.gateway';
import { SocketAuthGuard } from './auth.guard';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { LobbyModule } from '../lobby/lobby.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { BattleModule } from '../battle/battle.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    UserModule,
    LobbyModule,
    MatchmakingModule,
    BattleModule,
  ],
  providers: [SocketGateway, SocketAuthGuard],
  exports: [SocketGateway],
})
export class SocketModule {}
