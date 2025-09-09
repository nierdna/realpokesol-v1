import { Injectable } from '@nestjs/common';
import { IBattleRepository, Battle } from '../../ports/battle-repository.interface';

@Injectable()
export class PostgresBattleRepository implements IBattleRepository {
  constructor(
    // private prisma: PrismaService, // TODO: Add when implementing
  ) {}

  async create(battle: Battle): Promise<void> {
    throw new Error('PostgresBattleRepository not implemented yet');
  }

  async get(id: string): Promise<Battle | null> {
    throw new Error('PostgresBattleRepository not implemented yet');
  }

  async update(id: string, patch: Partial<Battle>): Promise<void> {
    throw new Error('PostgresBattleRepository not implemented yet');
  }

  async appendLog(id: string, line: string): Promise<void> {
    throw new Error('PostgresBattleRepository not implemented yet');
  }

  async endBattle(id: string, winnerId: string): Promise<void> {
    throw new Error('PostgresBattleRepository not implemented yet');
  }

  async delete(id: string): Promise<void> {
    throw new Error('PostgresBattleRepository not implemented yet');
  }

  async findByPlayerId(playerId: string): Promise<Battle | null> {
    throw new Error('PostgresBattleRepository not implemented yet');
  }

  async listActive(limit?: number): Promise<Battle[]> {
    throw new Error('PostgresBattleRepository not implemented yet');
  }
}
