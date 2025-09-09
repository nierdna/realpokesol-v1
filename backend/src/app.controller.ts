import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { UserService } from './user/user.service';
import { LobbyService } from './lobby/lobby.service';
import { MatchmakingService } from './matchmaking/matchmaking.service';
import { BattleService } from './battle/battle.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly userService: UserService,
    private readonly lobbyService: LobbyService,
    private readonly matchmakingService: MatchmakingService,
    private readonly battleService: BattleService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    try {
      const [userStats, lobbyStats, matchStats, battleStats] = await Promise.all([
        this.userService.getStats(),
        this.lobbyService.getStats(),
        this.matchmakingService.getStats(),
        this.battleService.getStats(),
      ]);

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          user: userStats,
          lobby: lobbyStats,
          matchmaking: matchStats,
          battle: battleStats,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}