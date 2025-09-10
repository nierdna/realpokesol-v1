import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  IUserRepository,
  User,
  UserSummary,
} from '../../ports/user-repository.interface';

@Injectable()
export class PostgresUserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(userId: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { creature: true },
    });

    return user ? this.mapToUser(user) : null;
  }

  async findByWallet(wallet: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { walletAddress: wallet },
      include: { creature: true },
    });

    return user ? this.mapToUser(user) : null;
  }

  async create(user: User): Promise<void> {
    await this.prisma.$transaction(async (tx: any) => {
      // Create user
      await tx.user.create({
        data: {
          id: user.id,
          walletAddress: user.walletAddress,
          nickname: user.nickname,
          socketId: user.socketId,
          posX: user.position.x,
          posY: user.position.y,
          isInBattle: user.isInBattle,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        },
      });

      // Create creature
      if (user.creature) {
        await tx.userCreature.create({
          data: {
            userId: user.id,
            name: user.creature.name,
            hp: user.creature.hp,
            maxHp: user.creature.maxHp,
            level: user.creature.level,
            isFainted: user.creature.isFainted,
          },
        });
      }
    });
  }

  async update(patch: Partial<User> & { id: string }): Promise<void> {
    const updateData: any = {};

    if (patch.nickname !== undefined) updateData.nickname = patch.nickname;
    if (patch.socketId !== undefined) updateData.socketId = patch.socketId;
    if (patch.position !== undefined) {
      updateData.posX = patch.position.x;
      updateData.posY = patch.position.y;
    }
    if (patch.isInBattle !== undefined)
      updateData.isInBattle = patch.isInBattle;
    if (patch.lastLoginAt !== undefined)
      updateData.lastLoginAt = patch.lastLoginAt;

    if (Object.keys(updateData).length > 0) {
      await this.prisma.user.update({
        where: { id: patch.id },
        data: updateData,
      });
    }
  }

  async setSocket(userId: string, socketId: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { socketId },
    });
  }

  async listOnline(limit: number = 100): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({
      where: {
        socketId: { not: null },
      },
      include: { creature: true },
      take: limit,
      orderBy: { lastLoginAt: 'desc' },
    });

    return users.map((user: any) => ({
      id: user.id,
      nickname: user.nickname,
      creature: user.creature
        ? {
            name: user.creature.name,
            hp: user.creature.hp,
            maxHp: user.creature.maxHp,
            level: user.creature.level,
            isFainted: user.creature.isFainted,
          }
        : null,
      position: { x: user.posX, y: user.posY },
    }));
  }

  async upsertCreature(
    userId: string,
    creature: User['creature'],
  ): Promise<void> {
    if (!creature) return;

    await this.prisma.userCreature.upsert({
      where: { userId },
      update: {
        name: creature.name,
        hp: creature.hp,
        maxHp: creature.maxHp,
        level: creature.level,
        isFainted: creature.isFainted,
      },
      create: {
        userId,
        name: creature.name,
        hp: creature.hp,
        maxHp: creature.maxHp,
        level: creature.level,
        isFainted: creature.isFainted,
      },
    });
  }

  async setInBattle(userId: string, inBattle: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isInBattle: inBattle },
    });
  }

  async updatePosition(
    userId: string,
    position: { x: number; y: number },
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        posX: position.x,
        posY: position.y,
      },
    });
  }

  private mapToUser(user: any): User {
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      nickname: user.nickname,
      socketId: user.socketId,
      position: { x: user.posX, y: user.posY },
      creature: user.creature
        ? {
            name: user.creature.name,
            hp: user.creature.hp,
            maxHp: user.creature.maxHp,
            level: user.creature.level,
            isFainted: user.creature.isFainted,
          }
        : null,
      isInBattle: user.isInBattle,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
