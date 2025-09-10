import { IUserRepository } from './user-repository.interface';
import { IBattleRepository } from './battle-repository.interface';

export interface TransactionContext {
  userRepo: IUserRepository;
  battleRepo: IBattleRepository;
}

export interface IUnitOfWork {
  withTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
