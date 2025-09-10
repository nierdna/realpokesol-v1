import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IBattleRepository } from '../storage/ports/battle-repository.interface';
import {
  Battle,
  BattleState,
} from '../storage/ports/battle-repository.interface';
import { STORAGE_TOKENS } from '../storage/tokens';
import { UserService } from '../user/user.service';
import { randomUUID } from 'crypto';

export interface BattleTurnResult {
  damage: number;
  isCrit: boolean;
  targetHp: number;
  log: string;
  currentTurnOwnerId: string;
  nextTurnOwnerId: string;
  battleEnded: boolean;
  winnerId?: string;
}

export interface BattleEndResult {
  winnerId: string;
  newLevels: { [userId: string]: number };
  reason?: 'KO' | 'AFK_TIMEOUT';
}

@Injectable()
export class BattleService {
  private readonly logger = new Logger(BattleService.name);
  private readonly battleTimeoutMs: number;

  // Track battle timeouts and processed actions
  private battleTimeouts = new Map<string, NodeJS.Timeout>();
  private processedActions = new Map<string, Set<string>>(); // battleId -> Set<requestId>

  constructor(
    @Inject(STORAGE_TOKENS.BattleRepository)
    private battleRepository: IBattleRepository,
    private userService: UserService,
    private configService: ConfigService,
  ) {
    this.battleTimeoutMs =
      this.configService.get<number>('BATTLE_TIMEOUT_SECONDS', 60) * 1000;
  }

  /**
   * Create new battle
   */
  async createBattle(
    player1Id: string,
    player2Id: string,
    roomId: string,
  ): Promise<Battle> {
    const player1 = await this.userService.findById(player1Id);
    const player2 = await this.userService.findById(player2Id);

    if (!player1 || !player2) {
      throw new Error('Players not found');
    }

    const currentTurn = Math.random() > 0.5 ? 'player1' : 'player2'; // Random first turn
    const firstPlayerName =
      currentTurn === 'player1' ? player1.nickname : player2.nickname;

    const battle: Battle = {
      id: roomId,
      player1Id,
      player2Id,
      currentTurn,
      turnCount: 0,
      state: 'active',
      createdAt: new Date(),
      log: [
        `Battle started: ${player1.nickname} vs ${player2.nickname}`,
        `${firstPlayerName} goes first!`,
      ],
    };

    await this.battleRepository.create(battle);
    this.processedActions.set(roomId, new Set());
    this.setBattleTimeout(roomId);

    this.logger.log(
      `Battle created: ${roomId} - ${player1.nickname} vs ${player2.nickname}`,
    );
    return battle;
  }

  /**
   * Get battle state for clients
   */
  async getBattleState(battleId: string): Promise<BattleState | null> {
    const battle = await this.battleRepository.get(battleId);
    if (!battle) {
      return null;
    }

    const player1 = await this.userService.findById(battle.player1Id);
    const player2 = await this.userService.findById(battle.player2Id);

    if (!player1 || !player2) {
      return null;
    }

    return {
      p1: {
        id: player1.id,
        hp: player1.creature?.hp || 55,
        maxHp: player1.creature?.maxHp || 55,
        level: player1.creature?.level || 1,
      },
      p2: {
        id: player2.id,
        hp: player2.creature?.hp || 55,
        maxHp: player2.creature?.maxHp || 55,
        level: player2.creature?.level || 1,
      },
      currentTurnOwnerId:
        battle.currentTurn === 'player1' ? battle.player1Id : battle.player2Id,
      turnCount: battle.turnCount,
    };
  }

  /**
   * Process battle action (attack)
   */
  async processAction(
    battleId: string,
    userId: string,
    action: 'attack',
    requestId: string,
  ): Promise<BattleTurnResult | null> {
    // Check for duplicate requestId (idempotency)
    const processedSet = this.processedActions.get(battleId);
    if (processedSet?.has(requestId)) {
      return null; // Already processed
    }

    const battle = await this.battleRepository.get(battleId);
    if (!battle || battle.state !== 'active') {
      return null;
    }

    // Verify it's the user's turn
    const currentTurnUserId =
      battle.currentTurn === 'player1' ? battle.player1Id : battle.player2Id;
    if (currentTurnUserId !== userId) {
      return null; // Not user's turn
    }

    // Mark action as processed
    if (processedSet) {
      processedSet.add(requestId);
    }

    // Reset battle timeout
    this.setBattleTimeout(battleId);

    // Get players
    const attacker = await this.userService.findById(userId);
    const defenderId =
      userId === battle.player1Id ? battle.player2Id : battle.player1Id;
    const defender = await this.userService.findById(defenderId);

    if (!attacker || !defender) {
      throw new Error('Players not found');
    }

    // Calculate damage
    const baseDamage = Math.floor(Math.random() * 51) + 10; // 10-60
    const isCrit = Math.random() < 0.1; // 10% crit chance
    const finalDamage = Math.floor(baseDamage * (isCrit ? 1.5 : 1.0));

    // Apply damage
    const newHp = Math.max(0, (defender.creature?.hp || 55) - finalDamage);
    await this.userService.updateCreature(defenderId, { hp: newHp });

    // Create log entry
    const critText = isCrit ? ' (Critical Hit!)' : '';
    const logEntry = `${attacker.nickname} attacks ${defender.nickname} for ${finalDamage} damage${critText}`;
    await this.battleRepository.appendLog(battleId, logEntry);

    // Check if battle ended
    const battleEnded = newHp <= 0;
    let winnerId: string | undefined;

    if (battleEnded) {
      winnerId = userId;
      await this.endBattle(battleId, winnerId);
    } else {
      // Switch turns
      const newCurrentTurn =
        battle.currentTurn === 'player1' ? 'player2' : 'player1';
      await this.battleRepository.update(battleId, {
        currentTurn: newCurrentTurn,
        turnCount: battle.turnCount + 1,
      });
    }

    // Determine next turn owner
    const nextTurnOwnerId = battleEnded
      ? userId
      : userId === battle.player1Id
        ? battle.player2Id
        : battle.player1Id;

    return {
      damage: finalDamage,
      isCrit,
      targetHp: newHp,
      log: logEntry,
      currentTurnOwnerId: userId,
      nextTurnOwnerId,
      battleEnded,
      winnerId,
    };
  }

  /**
   * End battle and handle rewards/penalties
   */
  async endBattle(
    battleId: string,
    winnerId: string,
  ): Promise<BattleEndResult> {
    const battle = await this.battleRepository.get(battleId);
    if (!battle) {
      throw new Error(`Battle not found: ${battleId}`);
    }

    const loserId =
      winnerId === battle.player1Id ? battle.player2Id : battle.player1Id;

    // End battle in repository
    await this.battleRepository.endBattle(battleId, winnerId);

    // Level up winner
    await this.userService.levelUp(winnerId);

    // Faint and revive loser
    await this.userService.faintCreature(loserId);
    await this.userService.reviveCreature(loserId);

    // Remove players from battle
    await this.userService.setInBattle(winnerId, false);
    await this.userService.setInBattle(loserId, false);

    // Clear timeout
    this.clearBattleTimeout(battleId);
    this.processedActions.delete(battleId);

    // Get new levels
    const winner = await this.userService.findById(winnerId);
    const loser = await this.userService.findById(loserId);

    const result: BattleEndResult = {
      winnerId,
      newLevels: {
        [winnerId]: winner?.creature?.level || 1,
        [loserId]: loser?.creature?.level || 1,
      },
    };

    this.logger.log(`Battle ended: ${battleId}, winner: ${winnerId}`);
    return result;
  }

  /**
   * Handle battle timeout (AFK)
   */
  async handleBattleTimeout(battleId: string): Promise<BattleEndResult | null> {
    const battle = await this.battleRepository.get(battleId);
    if (!battle || battle.state === 'ended') {
      return null;
    }

    // Current turn owner loses due to AFK
    const afkUserId =
      battle.currentTurn === 'player1' ? battle.player1Id : battle.player2Id;
    const winnerId =
      afkUserId === battle.player1Id ? battle.player2Id : battle.player1Id;

    await this.battleRepository.appendLog(
      battleId,
      `${afkUserId} timed out - AFK loss`,
    );

    const result = await this.endBattle(battleId, winnerId);
    result.reason = 'AFK_TIMEOUT';

    this.logger.log(`Battle timeout: ${battleId}, AFK user: ${afkUserId}`);
    return result;
  }

  /**
   * Handle user reconnection during battle
   */
  async handleReconnect(
    userId: string,
  ): Promise<{ battleId: string; battleState: BattleState } | null> {
    // Find active battle for user
    const battle = await this.battleRepository.findByPlayerId(userId);
    if (!battle || battle.state !== 'active') {
      return null;
    }

    const battleState = await this.getBattleState(battle.id);
    if (!battleState) {
      return null;
    }

    this.logger.log(`User ${userId} reconnected to battle ${battle.id}`);

    return {
      battleId: battle.id,
      battleState,
    };
  }

  /**
   * Set battle timeout
   */
  private setBattleTimeout(battleId: string): void {
    this.clearBattleTimeout(battleId);

    const timeout = setTimeout(async () => {
      await this.handleBattleTimeout(battleId);
    }, this.battleTimeoutMs);

    this.battleTimeouts.set(battleId, timeout);
  }

  /**
   * Clear battle timeout
   */
  private clearBattleTimeout(battleId: string): void {
    const timeout = this.battleTimeouts.get(battleId);
    if (timeout) {
      clearTimeout(timeout);
      this.battleTimeouts.delete(battleId);
    }
  }

  /**
   * Get battle stats
   */
  async getStats() {
    const activeBattles = await this.battleRepository.listActive();

    return {
      activeBattles: activeBattles.length,
      activeTimeouts: this.battleTimeouts.size,
      processedActions: this.processedActions.size,
    };
  }

  /**
   * Emergency cleanup (when user disconnects)
   */
  async cleanup(userId: string): Promise<void> {
    // Find and end any active battle
    const battle = await this.battleRepository.findByPlayerId(userId);
    if (battle && battle.state === 'active') {
      const winnerId =
        userId === battle.player1Id ? battle.player2Id : battle.player1Id;
      await this.endBattle(battle.id, winnerId);
      this.logger.log(`Battle force-ended due to disconnect: ${battle.id}`);
    }
  }
}
