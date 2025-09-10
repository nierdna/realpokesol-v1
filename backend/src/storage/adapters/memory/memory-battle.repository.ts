import { Injectable, Logger } from '@nestjs/common';
import {
  IBattleRepository,
  Battle,
} from '../../ports/battle-repository.interface';

@Injectable()
export class MemoryBattleRepository implements IBattleRepository {
  private readonly logger = new Logger(MemoryBattleRepository.name);
  private battles = new Map<string, Battle>();
  private playerBattleIndex = new Map<string, string>(); // playerId -> battleId

  async create(battle: Battle): Promise<void> {
    this.battles.set(battle.id, { ...battle, log: [...battle.log] });

    // Update player battle index
    this.playerBattleIndex.set(battle.player1Id, battle.id);
    this.playerBattleIndex.set(battle.player2Id, battle.id);

    this.logger.log(
      `Battle created: ${battle.id} (${battle.player1Id} vs ${battle.player2Id})`,
    );
  }

  async get(id: string): Promise<Battle | null> {
    const battle = this.battles.get(id);
    return battle ? { ...battle, log: [...battle.log] } : null;
  }

  async update(id: string, patch: Partial<Battle>): Promise<void> {
    const current = this.battles.get(id);
    if (!current) {
      throw new Error(`Battle not found: ${id}`);
    }

    const updated = { ...current, ...patch };
    this.battles.set(id, updated);
  }

  async appendLog(id: string, line: string): Promise<void> {
    const battle = this.battles.get(id);
    if (!battle) {
      throw new Error(`Battle not found: ${id}`);
    }

    battle.log.push(line);
    this.battles.set(id, battle);
  }

  async endBattle(id: string, winnerId: string): Promise<void> {
    const battle = this.battles.get(id);
    if (!battle) {
      throw new Error(`Battle not found: ${id}`);
    }

    battle.state = 'ended';
    battle.winnerId = winnerId;
    this.battles.set(id, battle);

    // Remove from player battle index
    this.playerBattleIndex.delete(battle.player1Id);
    this.playerBattleIndex.delete(battle.player2Id);

    this.logger.log(`Battle ended: ${id}, winner: ${winnerId}`);
  }

  async delete(id: string): Promise<void> {
    const battle = this.battles.get(id);
    if (battle) {
      this.playerBattleIndex.delete(battle.player1Id);
      this.playerBattleIndex.delete(battle.player2Id);
    }

    this.battles.delete(id);
    this.logger.log(`Battle deleted: ${id}`);
  }

  async findByPlayerId(playerId: string): Promise<Battle | null> {
    const battleId = this.playerBattleIndex.get(playerId);
    return battleId ? this.get(battleId) : null;
  }

  async listActive(limit = 100): Promise<Battle[]> {
    const active: Battle[] = [];

    for (const battle of this.battles.values()) {
      if (battle.state === 'active' || battle.state === 'waiting') {
        active.push({ ...battle, log: [...battle.log] });
        if (active.length >= limit) break;
      }
    }

    return active;
  }

  // Debug methods
  getStats() {
    const states = { waiting: 0, active: 0, ended: 0 };
    for (const battle of this.battles.values()) {
      states[battle.state]++;
    }

    return {
      total: this.battles.size,
      states,
      playerBattleIndex: this.playerBattleIndex.size,
    };
  }

  clear(): void {
    this.battles.clear();
    this.playerBattleIndex.clear();
    this.logger.log('All battles cleared');
  }
}
