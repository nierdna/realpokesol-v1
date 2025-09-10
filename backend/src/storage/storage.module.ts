import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_TOKENS } from './tokens';

// Memory adapters
import { MemoryUserRepository } from './adapters/memory/memory-user.repository';
import { MemoryBattleRepository } from './adapters/memory/memory-battle.repository';
import { MemoryMatchQueue } from './adapters/memory/memory-match-queue.repository';

@Module({
  imports: [ConfigModule],
  providers: [
    // User Repository
    {
      provide: STORAGE_TOKENS.UserRepository,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'memory');

        switch (driver) {
          case 'postgres':
            // TODO: Implement PostgresUserRepository
            throw new Error('Postgres adapter not implemented yet');
          case 'memory':
          default:
            return new MemoryUserRepository();
        }
      },
      inject: [ConfigService],
    },

    // Battle Repository
    {
      provide: STORAGE_TOKENS.BattleRepository,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'memory');

        switch (driver) {
          case 'postgres':
            // TODO: Implement PostgresBattleRepository
            throw new Error('Postgres adapter not implemented yet');
          case 'memory':
          default:
            return new MemoryBattleRepository();
        }
      },
      inject: [ConfigService],
    },

    // Match Queue
    {
      provide: STORAGE_TOKENS.MatchQueue,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'memory');

        switch (driver) {
          case 'postgres':
            // TODO: Could use Redis or Postgres for queue
            return new MemoryMatchQueue(); // Fallback to memory for now
          case 'memory':
          default:
            return new MemoryMatchQueue();
        }
      },
      inject: [ConfigService],
    },

    // Unit of Work - Simplified for now
    {
      provide: STORAGE_TOKENS.UnitOfWork,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'memory');

        switch (driver) {
          case 'postgres':
            // TODO: Implement PostgresUnitOfWork
            throw new Error('Postgres adapter not implemented yet');
          case 'memory':
          default:
            // For memory, we'll inject repos when needed
            return {
              withTransaction: async (fn: any) => fn({}),
            };
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    STORAGE_TOKENS.UserRepository,
    STORAGE_TOKENS.BattleRepository,
    STORAGE_TOKENS.MatchQueue,
    STORAGE_TOKENS.UnitOfWork,
  ],
})
export class StorageModule {}
