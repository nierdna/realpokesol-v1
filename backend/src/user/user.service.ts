import { Injectable, Logger, Inject } from '@nestjs/common';
import type { IUserRepository } from '../storage/ports/user-repository.interface';
import { User } from '../storage/ports/user-repository.interface';
import { STORAGE_TOKENS } from '../storage/tokens';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @Inject(STORAGE_TOKENS.UserRepository)
    private userRepository: IUserRepository,
  ) {}

  /**
   * Get user by ID
   */
  async findById(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }

  /**
   * Get user by wallet address
   */
  async findByWallet(wallet: string): Promise<User | null> {
    return this.userRepository.findByWallet(wallet);
  }

  /**
   * Bind socket to user (when user connects)
   */
  async bindSocket(userId: string, socketId: string): Promise<void> {
    await this.userRepository.setSocket(userId, socketId);
    this.logger.log(`Socket bound: ${userId} -> ${socketId}`);
  }

  /**
   * Unbind socket from user (when user disconnects)
   */
  async unbindSocket(userId: string): Promise<void> {
    await this.userRepository.setSocket(userId, null);
    this.logger.log(`Socket unbound: ${userId}`);
  }

  /**
   * Update user position
   */
  async updatePosition(userId: string, x: number, y: number): Promise<void> {
    // Clamp position to reasonable bounds
    const clampedX = Math.max(-1000, Math.min(1000, x));
    const clampedY = Math.max(-1000, Math.min(1000, y));

    await this.userRepository.updatePosition(userId, {
      x: clampedX,
      y: clampedY,
    });
  }

  /**
   * Set user battle status
   */
  async setInBattle(userId: string, inBattle: boolean): Promise<void> {
    await this.userRepository.setInBattle(userId, inBattle);
    this.logger.log(`User ${userId} battle status: ${inBattle}`);
  }

  /**
   * Update creature stats (HP, level, etc.)
   */
  async updateCreature(
    userId: string,
    updates: Partial<User['creature']>,
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const updatedCreature = {
      ...user.creature,
      ...updates,
      // Ensure HP is within bounds
      hp: Math.max(
        0,
        Math.min(updates.hp ?? user.creature.hp, user.creature.maxHp),
      ),
      // Ensure level is within bounds
      level: Math.max(1, Math.min(100, updates.level ?? user.creature.level)),
    };

    // Recalculate maxHp if level changed
    if (updates.level && updates.level !== user.creature.level) {
      updatedCreature.maxHp = 50 + updatedCreature.level * 5;
      // If HP is higher than new maxHp, cap it
      updatedCreature.hp = Math.min(updatedCreature.hp, updatedCreature.maxHp);
    }

    await this.userRepository.upsertCreature(userId, updatedCreature);
    this.logger.log(`Creature updated for user ${userId}:`, updates);
  }

  /**
   * Level up user (after winning battle)
   */
  async levelUp(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const newLevel = Math.min(100, user.creature.level + 1);
    await this.updateCreature(userId, { level: newLevel });

    this.logger.log(`User ${userId} leveled up to ${newLevel}`);
  }

  /**
   * Revive fainted creature
   */
  async reviveCreature(userId: string): Promise<void> {
    await this.updateCreature(userId, {
      hp: 1,
      isFainted: false,
    });

    this.logger.log(`Creature revived for user ${userId}`);
  }

  /**
   * Faint creature (when HP reaches 0)
   */
  async faintCreature(userId: string): Promise<void> {
    await this.updateCreature(userId, {
      hp: 0,
      isFainted: true,
    });

    this.logger.log(`Creature fainted for user ${userId}`);
  }

  /**
   * Get all online users for lobby
   */
  async getOnlineUsers(limit = 100): Promise<User[]> {
    const summaries = await this.userRepository.listOnline(limit);
    const users: User[] = [];

    for (const summary of summaries) {
      const fullUser = await this.userRepository.findById(summary.id);
      if (fullUser) {
        users.push(fullUser);
      }
    }

    return users;
  }

  /**
   * Get user stats
   */
  async getStats() {
    const onlineUsers = await this.userRepository.listOnline();
    return {
      online: onlineUsers.length,
      // Add more stats as needed
    };
  }
}
