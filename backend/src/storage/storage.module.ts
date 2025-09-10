import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_TOKENS } from './tokens';
import { PrismaService } from './prisma.service';

// Memory adapters
import { MemoryUserRepository } from './adapters/memory/memory-user.repository';
import { MemoryBattleRepository } from './adapters/memory/memory-battle.repository';
import { MemoryMatchQueue } from './adapters/memory/memory-match-queue.repository';
import { MemoryUnitOfWork } from './adapters/memory/memory-unit-of-work';

// Postgres adapters
import { PostgresUserRepository } from './adapters/postgres/postgres-user.repository';
import { PostgresBattleRepository } from './adapters/postgres/postgres-battle.repository';
import { PostgresUnitOfWork } from './adapters/postgres/postgres-unit-of-work';

@Module({
  imports: [ConfigModule],
  providers: [
    // Prisma Service (only created when needed)
    {
      provide: PrismaService,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'memory');
        return driver === 'postgres' ? new PrismaService() : null;
      },
      inject: [ConfigService],
    },

    // User Repository
    {
      provide: STORAGE_TOKENS.UserRepository,
      useFactory: (configService: ConfigService, prisma?: PrismaService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'memory');

        switch (driver) {
          case 'postgres':
            if (!prisma) {
              throw new Error(
                'PrismaService not available for Postgres adapter',
              );
            }
            return new PostgresUserRepository(prisma);
          case 'memory':
          default:
            return new MemoryUserRepository();
        }
      },
      inject: [ConfigService, PrismaService],
    },

    // Battle Repository
    {
      provide: STORAGE_TOKENS.BattleRepository,
      useFactory: (configService: ConfigService, prisma?: PrismaService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'memory');

        switch (driver) {
          case 'postgres':
            if (!prisma) {
              throw new Error(
                'PrismaService not available for Postgres adapter',
              );
            }
            return new PostgresBattleRepository(prisma);
          case 'memory':
          default:
            return new MemoryBattleRepository();
        }
      },
      inject: [ConfigService, PrismaService],
    },

    // Match Queue (always memory for MVP, can extend to Redis/Postgres later)
    {
      provide: STORAGE_TOKENS.MatchQueue,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'memory');

        switch (driver) {
          case 'postgres':
            // For now, still use memory queue even with Postgres
            // TODO: Could implement PostgresMatchQueue or Redis queue
            return new MemoryMatchQueue();
          case 'memory':
          default:
            return new MemoryMatchQueue();
        }
      },
      inject: [ConfigService],
    },

    // Unit of Work
    {
      provide: STORAGE_TOKENS.UnitOfWork,
      useFactory: (
        configService: ConfigService,
        prisma?: PrismaService,
        userRepo?: MemoryUserRepository,
        battleRepo?: MemoryBattleRepository,
      ) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'memory');

        switch (driver) {
          case 'postgres':
            if (!prisma) {
              throw new Error(
                'PrismaService not available for Postgres UnitOfWork',
              );
            }
            return new PostgresUnitOfWork(prisma);
          case 'memory':
          default:
            // For memory, create a simple unit of work with existing repos
            return new MemoryUnitOfWork(
              userRepo || new MemoryUserRepository(),
              battleRepo || new MemoryBattleRepository(),
            );
        }
      },
      inject: [
        ConfigService,
        PrismaService,
        STORAGE_TOKENS.UserRepository,
        STORAGE_TOKENS.BattleRepository,
      ],
    },
  ],
  exports: [
    STORAGE_TOKENS.UserRepository,
    STORAGE_TOKENS.BattleRepository,
    STORAGE_TOKENS.MatchQueue,
    STORAGE_TOKENS.UnitOfWork,
    PrismaService,
  ],
})
export class StorageModule {}
