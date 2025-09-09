import { Injectable, Logger } from '@nestjs/common';
import { IUserRepository, User, UserSummary } from '../../ports/user-repository.interface';

@Injectable()
export class MemoryUserRepository implements IUserRepository {
  private readonly logger = new Logger(MemoryUserRepository.name);
  private users = new Map<string, User>();
  private walletIndex = new Map<string, string>(); // wallet -> userId

  async findById(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async findByWallet(wallet: string): Promise<User | null> {
    const userId = this.walletIndex.get(wallet);
    return userId ? this.findById(userId) : null;
  }

  async create(user: User): Promise<void> {
    this.users.set(user.id, { ...user });
    this.walletIndex.set(user.walletAddress, user.id);
    this.logger.log(`User created: ${user.id} (${user.walletAddress})`);
  }

  async update(patch: Partial<User> & { id: string }): Promise<void> {
    const current = this.users.get(patch.id);
    if (!current) {
      throw new Error(`User not found: ${patch.id}`);
    }

    const updated = { ...current, ...patch };
    this.users.set(patch.id, updated);

    // Update wallet index if wallet changed
    if (patch.walletAddress && patch.walletAddress !== current.walletAddress) {
      this.walletIndex.delete(current.walletAddress);
      this.walletIndex.set(patch.walletAddress, patch.id);
    }
  }

  async setSocket(userId: string, socketId: string | null): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.socketId = socketId || undefined;
    this.users.set(userId, user);
  }

  async listOnline(limit = 100): Promise<UserSummary[]> {
    const online: UserSummary[] = [];

    for (const user of this.users.values()) {
      if (user.socketId) {
        online.push({
          id: user.id,
          nickname: user.nickname,
          creature: user.creature,
          position: user.position,
        });

        if (online.length >= limit) break;
      }
    }

    return online;
  }

  async upsertCreature(userId: string, creature: User['creature']): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.creature = { ...creature };
    this.users.set(userId, user);
  }

  async setInBattle(userId: string, inBattle: boolean): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.isInBattle = inBattle;
    this.users.set(userId, user);
  }

  async updatePosition(userId: string, position: { x: number; y: number }): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.position = { ...position };
    this.users.set(userId, user);
  }

  // Debug methods
  getStats() {
    const online = Array.from(this.users.values()).filter(u => u.socketId).length;
    return {
      total: this.users.size,
      online,
      inBattle: Array.from(this.users.values()).filter(u => u.isInBattle).length,
    };
  }

  clear(): void {
    this.users.clear();
    this.walletIndex.clear();
    this.logger.log('All users cleared');
  }
}
