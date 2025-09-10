import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  IUnitOfWork,
  TransactionContext,
} from '../../ports/unit-of-work.interface';
import { PostgresUserRepository } from './postgres-user.repository';
import { PostgresBattleRepository } from './postgres-battle.repository';

@Injectable()
export class PostgresUnitOfWork implements IUnitOfWork {
  constructor(private prisma: PrismaClient) {}

  async withTransaction<T>(
    fn: (tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (trx: PrismaClient) => {
      const userRepo = new PostgresUserRepository(trx as PrismaClient);
      const battleRepo = new PostgresBattleRepository(trx as PrismaClient);
      
      const context: TransactionContext = {
        userRepo,
        battleRepo,
      };

      return fn(context);
    });
  }
}
