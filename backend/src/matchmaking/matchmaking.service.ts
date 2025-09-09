import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IMatchQueue } from '../storage/ports/match-queue.interface';
import { STORAGE_TOKENS } from '../storage/tokens';
import { UserService } from '../user/user.service';
import { randomUUID } from 'crypto';

export interface MatchResult {
  roomId: string;
  player1Id: string;
  player2Id: string;
  player1: {
    id: string;
    nickname: string;
    level: number;
  };
  player2: {
    id: string;
    nickname: string;
    level: number;
  };
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);
  private readonly matchTimeoutMs: number;
  
  // Track timeouts for users in queue
  private queueTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(STORAGE_TOKENS.MatchQueue)
    private matchQueue: IMatchQueue,
    private userService: UserService,
    private configService: ConfigService,
  ) {
    this.matchTimeoutMs = this.configService.get<number>('MATCH_TIMEOUT_SECONDS', 60) * 1000;
  }

  /**
   * Add user to matchmaking queue
   */
  async joinQueue(userId: string): Promise<void> {
    // Verify user exists and is not in battle
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (user.isInBattle) {
      throw new Error(`User is already in battle: ${userId}`);
    }

    // Add to queue (idempotent)
    await this.matchQueue.join(userId);
    
    // Set timeout for this user
    this.setQueueTimeout(userId);

    const position = await this.matchQueue.getPosition(userId);
    this.logger.log(`User ${user.nickname} joined queue at position ${position}`);

    // Try to find match
    await this.tryCreateMatch();
  }

  /**
   * Remove user from matchmaking queue
   */
  async leaveQueue(userId: string): Promise<void> {
    await this.matchQueue.leave(userId);
    this.clearQueueTimeout(userId);

    const user = await this.userService.findById(userId);
    this.logger.log(`User ${user?.nickname || userId} left queue`);
  }

  /**
   * Try to create a match with fairness algorithm
   */
  async tryCreateMatch(): Promise<MatchResult | null> {
    // Get next 2 players using fairness algorithm
    const candidates = await this.matchQueue.getNext(2);
    
    if (candidates.length < 2) {
      return null; // Not enough players
    }

    const [player1Entry, player2Entry] = candidates;

    // Get full user data
    const player1 = await this.userService.findById(player1Entry.userId);
    const player2 = await this.userService.findById(player2Entry.userId);

    if (!player1 || !player2 || !player1.socketId || !player2.socketId) {
      // Remove invalid players from queue
      await this.matchQueue.remove([player1Entry.userId, player2Entry.userId]);
      return null;
    }

    // Remove players from queue
    await this.matchQueue.remove([player1.id, player2.id]);
    this.clearQueueTimeout(player1.id);
    this.clearQueueTimeout(player2.id);

    // Set players as in battle
    await this.userService.setInBattle(player1.id, true);
    await this.userService.setInBattle(player2.id, true);

    // Create match result
    const roomId = randomUUID();
    const matchResult: MatchResult = {
      roomId,
      player1Id: player1.id,
      player2Id: player2.id,
      player1: {
        id: player1.id,
        nickname: player1.nickname,
        level: player1.creature.level,
      },
      player2: {
        id: player2.id,
        nickname: player2.nickname,
        level: player2.creature.level,
      },
    };

    this.logger.log(
      `Match created: ${roomId} - ${player1.nickname} vs ${player2.nickname}`
    );

    return matchResult;
  }

  /**
   * Handle queue timeout for a user
   */
  async handleQueueTimeout(userId: string): Promise<void> {
    await this.leaveQueue(userId);
    
    const user = await this.userService.findById(userId);
    this.logger.log(`Queue timeout for user: ${user?.nickname || userId}`);
  }

  /**
   * Set queue timeout for user
   */
  private setQueueTimeout(userId: string): void {
    // Clear existing timeout
    this.clearQueueTimeout(userId);

    // Set new timeout
    const timeout = setTimeout(async () => {
      await this.handleQueueTimeout(userId);
    }, this.matchTimeoutMs);

    this.queueTimeouts.set(userId, timeout);
  }

  /**
   * Clear queue timeout for user
   */
  private clearQueueTimeout(userId: string): void {
    const timeout = this.queueTimeouts.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.queueTimeouts.delete(userId);
    }
  }

  /**
   * Cleanup rate limiting maps
   */
  private cleanupRateLimits(): void {
    // This could be expanded to cleanup old rate limiting entries
    // For now, we rely on natural cleanup when users disconnect
  }

  /**
   * Get matchmaking stats
   */
  async getStats() {
    const queueStats = await this.matchQueue.getStats();
    
    return {
      queue: queueStats,
      activeTimeouts: this.queueTimeouts.size,
    };
  }

  /**
   * Emergency cleanup (when user disconnects)
   */
  async cleanup(userId: string): Promise<void> {
    await this.leaveQueue(userId);
    await this.userService.setInBattle(userId, false);
    this.logger.log(`Emergency cleanup for user: ${userId}`);
  }
}
