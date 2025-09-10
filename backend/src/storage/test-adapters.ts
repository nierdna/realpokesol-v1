#!/usr/bin/env node

/**
 * Test script to validate Storage Adapter implementations
 * Usage: npx ts-node src/storage/test-adapters.ts
 */

import { randomUUID } from 'crypto';
import { MemoryUserRepository } from './adapters/memory/memory-user.repository';
import { MemoryBattleRepository } from './adapters/memory/memory-battle.repository';
import { PostgresUserRepository } from './adapters/postgres/postgres-user.repository';
import { PostgresBattleRepository } from './adapters/postgres/postgres-battle.repository';
import { PrismaClient } from '@prisma/client';
import type { User } from './ports/user-repository.interface';
import type { Battle } from './ports/battle-repository.interface';

async function testUserRepository(repo: any, name: string) {
  console.log(`\n🧪 Testing ${name} User Repository...`);

  const testUser: User = {
    id: randomUUID(),
    walletAddress: 'test-wallet-' + Date.now(),
    nickname: 'TestPlayer',
    socketId: 'test-socket-123',
    position: { x: 100, y: 200 },
    creature: {
      name: 'Pikachu',
      hp: 55,
      maxHp: 55,
      level: 1,
      isFainted: false,
    },
    isInBattle: false,
    createdAt: new Date(),
    lastLoginAt: new Date(),
  };

  try {
    // Test create
    await repo.create(testUser);
    console.log('✅ Create user: OK');

    // Test findById
    const foundById = await repo.findById(testUser.id);
    console.log('✅ Find by ID: OK', foundById ? '(found)' : '(not found)');

    // Test findByWallet
    const foundByWallet = await repo.findByWallet(testUser.walletAddress);
    console.log('✅ Find by wallet: OK', foundByWallet ? '(found)' : '(not found)');

    // Test update
    await repo.update({ id: testUser.id, nickname: 'UpdatedPlayer' });
    console.log('✅ Update user: OK');

    // Test setSocket
    await repo.setSocket(testUser.id, 'new-socket-456');
    console.log('✅ Set socket: OK');

    // Test listOnline
    const onlineUsers = await repo.listOnline(10);
    console.log('✅ List online: OK', `(${onlineUsers.length} users)`);

    // Test upsertCreature
    await repo.upsertCreature(testUser.id, {
      name: 'Charizard',
      hp: 78,
      maxHp: 78,
      level: 2,
      isFainted: false,
    });
    console.log('✅ Upsert creature: OK');

    console.log(`✅ ${name} User Repository: ALL TESTS PASSED`);
    return true;
  } catch (error) {
    console.error(`❌ ${name} User Repository test failed:`, error);
    return false;
  }
}

async function testBattleRepository(repo: any, name: string) {
  console.log(`\n🧪 Testing ${name} Battle Repository...`);

  const testBattle: Battle = {
    id: randomUUID(),
    player1Id: 'player1-' + Date.now(),
    player2Id: 'player2-' + Date.now(),
    currentTurn: 'player1',
    turnCount: 0,
    state: 'waiting',
    winnerId: undefined,
    createdAt: new Date(),
    log: ['Battle started'],
  };

  try {
    // Test create
    await repo.create(testBattle);
    console.log('✅ Create battle: OK');

    // Test get
    const foundBattle = await repo.get(testBattle.id);
    console.log('✅ Get battle: OK', foundBattle ? '(found)' : '(not found)');

    // Test update
    await repo.update(testBattle.id, { turnCount: 1, currentTurn: 'player2' });
    console.log('✅ Update battle: OK');

    // Test appendLog
    await repo.appendLog(testBattle.id, 'Player 1 attacks!');
    console.log('✅ Append log: OK');

    // Test endBattle
    await repo.endBattle(testBattle.id, testBattle.player1Id);
    console.log('✅ End battle: OK');

    console.log(`✅ ${name} Battle Repository: ALL TESTS PASSED`);
    return true;
  } catch (error) {
    console.error(`❌ ${name} Battle Repository test failed:`, error);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Storage Adapter Tests...\n');

  let allPassed = true;

  // Test Memory Adapters
  console.log('='.repeat(50));
  console.log('TESTING MEMORY ADAPTERS');
  console.log('='.repeat(50));

  const memoryUserRepo = new MemoryUserRepository();
  const memoryBattleRepo = new MemoryBattleRepository();

  const memoryUserTest = await testUserRepository(memoryUserRepo, 'Memory');
  const memoryBattleTest = await testBattleRepository(memoryBattleRepo, 'Memory');

  allPassed = allPassed && memoryUserTest && memoryBattleTest;

  // Test Postgres Adapters (only if DATABASE_URL is available)
  if (process.env.DATABASE_URL) {
    console.log('\n' + '='.repeat(50));
    console.log('TESTING POSTGRES ADAPTERS');
    console.log('='.repeat(50));

    const prisma = new PrismaClient();
    
    try {
      await prisma.$connect();
      console.log('✅ Postgres connection: OK');

      const postgresUserRepo = new PostgresUserRepository(prisma);
      const postgresBattleRepo = new PostgresBattleRepository(prisma);

      const postgresUserTest = await testUserRepository(postgresUserRepo, 'Postgres');
      const postgresBattleTest = await testBattleRepository(postgresBattleRepo, 'Postgres');

      allPassed = allPassed && postgresUserTest && postgresBattleTest;
    } catch (error) {
      console.error('❌ Postgres connection failed:', error);
      allPassed = false;
    } finally {
      await prisma.$disconnect();
    }
  } else {
    console.log('\n⚠️ DATABASE_URL not set, skipping Postgres tests');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('TEST SUMMARY');
  console.log('='.repeat(50));

  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('✅ Storage Adapter pattern is working correctly');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED!');
    console.log('🔧 Please check the implementation and try again');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('💥 Test runner crashed:', error);
  process.exit(1);
});
