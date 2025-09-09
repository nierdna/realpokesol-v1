import { Injectable } from '@nestjs/common';
import { IUnitOfWork, TransactionContext } from '../../ports/unit-of-work.interface';
import { MemoryUserRepository } from './memory-user.repository';
import { MemoryBattleRepository } from './memory-battle.repository';

@Injectable()
export class MemoryUnitOfWork implements IUnitOfWork {
  constructor(
    private userRepo: MemoryUserRepository,
    private battleRepo: MemoryBattleRepository,
  ) {}

  async withTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    // For memory adapter, we don't have real transactions
    // But we can provide the same interface for consistency
    const context: TransactionContext = {
      userRepo: this.userRepo,
      battleRepo: this.battleRepo,
    };

    return fn(context);
  }
}
