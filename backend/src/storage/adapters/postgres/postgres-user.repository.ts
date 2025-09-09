import { Injectable } from '@nestjs/common';
import { IUserRepository, User, UserSummary } from '../../ports/user-repository.interface';

@Injectable()
export class PostgresUserRepository implements IUserRepository {
  constructor(
    // private prisma: PrismaService, // TODO: Add when implementing
  ) {}

  async findById(userId: string): Promise<User | null> {
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async findByWallet(wallet: string): Promise<User | null> {
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async create(user: User): Promise<void> {
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async update(patch: Partial<User> & { id: string }): Promise<void> {
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async setSocket(userId: string, socketId: string | null): Promise<void> {
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async listOnline(limit?: number): Promise<UserSummary[]> {
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async upsertCreature(userId: string, creature: User['creature']): Promise<void> {
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async setInBattle(userId: string, inBattle: boolean): Promise<void> {
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async updatePosition(userId: string, position: { x: number; y: number }): Promise<void> {
    throw new Error('PostgresUserRepository not implemented yet');
  }
}
