import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  IBattleRepository,
  Battle,
} from '../../ports/battle-repository.interface';

@Injectable()
export class PostgresBattleRepository implements IBattleRepository {
  constructor(private prisma: PrismaClient) { }

  async create(battle: Battle): Promise<void> {
    await this.prisma.battle.create({
      data: {
        id: battle.id,
        player1Id: battle.player1Id,
        player2Id: battle.player2Id,
        currentTurn: battle.currentTurn,
        turnCount: battle.turnCount,
        state: battle.state,
        winnerId: battle.winnerId,
        createdAt: battle.createdAt,
      },
    });

    // Create initial logs if any
    if (battle.log && battle.log.length > 0) {
      for (let i = 0; i < battle.log.length; i++) {
        await this.appendLog(battle.id, battle.log[i]);
      }
    }
  }

  async get(id: string): Promise<Battle | null> {
    const battle = await this.prisma.battle.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { seq: 'asc' },
        },
      },
    });

    return battle ? this.mapToBattle(battle) : null;
  }

  async update(id: string, patch: Partial<Battle>): Promise<void> {
    const updateData: any = {};

    if (patch.currentTurn !== undefined) updateData.currentTurn = patch.currentTurn;
    if (patch.turnCount !== undefined) updateData.turnCount = patch.turnCount;
    if (patch.state !== undefined) updateData.state = patch.state;
    if (patch.winnerId !== undefined) updateData.winnerId = patch.winnerId;

    if (Object.keys(updateData).length > 0) {
      await this.prisma.battle.update({
        where: { id },
        data: updateData,
      });
    }
  }

  async appendLog(id: string, line: string): Promise<void> {
    // Get next sequence number safely
    const result = await this.prisma.$transaction(async (tx: any) => {
      const maxSeq = await tx.battleLog.findFirst({
        where: { battleId: id },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });

      const nextSeq = (maxSeq?.seq || 0) + 1;

      return tx.battleLog.create({
        data: {
          battleId: id,
          seq: nextSeq,
          line,
        },
      });
    });
  }

  async endBattle(id: string, winnerId: string): Promise<void> {
    await this.prisma.battle.update({
      where: { id },
      data: {
        state: 'ended',
        winnerId,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.battle.delete({
      where: { id },
    });
  }

  async findByPlayerId(playerId: string): Promise<Battle | null> {
    const battle = await this.prisma.battle.findFirst({
      where: {
        OR: [
          { player1Id: playerId },
          { player2Id: playerId },
        ],
        state: { in: ['waiting', 'active'] },
      },
      include: {
        logs: {
          orderBy: { seq: 'asc' },
        },
      },
    });

    return battle ? this.mapToBattle(battle) : null;
  }

  async listActive(limit: number = 50): Promise<Battle[]> {
    const battles = await this.prisma.battle.findMany({
      where: {
        state: { in: ['waiting', 'active'] },
      },
      include: {
        logs: {
          orderBy: { seq: 'asc' },
        },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return battles.map((battle: any) => this.mapToBattle(battle));
  }

  private mapToBattle(battle: any): Battle {
    return {
      id: battle.id,
      player1Id: battle.player1Id,
      player2Id: battle.player2Id,
      currentTurn: battle.currentTurn,
      turnCount: battle.turnCount,
      state: battle.state,
      winnerId: battle.winnerId,
      createdAt: battle.createdAt,
      log: battle.logs ? battle.logs.map((log: any) => log.line) : [],
    };
  }
}
