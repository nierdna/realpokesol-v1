# Pokémon Summon Arena MVP - Development Plan

## Project Overview

**Target**: Xây dựng game PvP turn-based 2D với authentication Solana trong 2-3 tuần
**Tech Stack**: 
- Frontend: Next.js 15 + Phaser 3 + Socket.io client + Solana wallet adapter
- Backend: NestJS + Socket.io + Storage Adapter (Memory → Postgres)

**Timeline**: 19-26 ngày (2.7-3.7 tuần)

---

## Phase 1: Foundation & Setup (3-4 ngày) ✅

### 1.1 Project Structure Setup
- [x] Tạo monorepo với `/backend` và `/frontend`
- [x] Setup pnpm workspace
- [x] Configure TypeScript, ESLint, Prettier
- [ ] Setup Docker Compose (optional)
- [x] Environment configuration

### 1.2 Backend Foundation
- [x] NestJS project initialization
- [x] Basic module structure (Auth, User, Lobby, Battle, Storage)
- [x] JWT configuration
- [x] Socket.io gateway setup
- [x] CORS và security configuration

### 1.3 Frontend Foundation  
- [x] Next.js 15 project setup
- [x] Phaser 3 integration
- [x] Solana wallet adapter setup
- [x] Basic routing (`/` và `/game`)
- [x] Socket.io client configuration

---

## Phase 2: Authentication System (2-3 ngày) ✅

### 2.1 SIWS Implementation
- [x] Nonce generation endpoint (`GET /auth/nonce`)
- [x] SIWS verification logic với Ed25519
- [x] JWT token issuance
- [x] Message template chuẩn SIWS
- [x] Rate limiting cho auth endpoints
- [x] Both `/auth/siws` và `/auth/verify` endpoints (SRS compliance + backward compatibility)

### 2.2 Socket Authentication
- [x] JWT verification middleware
- [x] Socket handshake authentication
- [x] Single-session policy (kick duplicate connections)
- [x] Connection lifecycle management

---

## Phase 3: Storage Adapter Pattern (2 ngày) ✅

### 3.1 Adapter Design
- [x] Define repository interfaces (IUserRepository, IBattleRepository)
- [x] Unit of Work pattern interface
- [x] DI tokens và factory pattern
- [x] Storage Module configuration

### 3.2 Memory Adapter (MVP)
- [x] MemoryUserRepo implementation
- [x] MemoryBattleRepo implementation  
- [x] MemoryMatchQueue implementation
- [x] In-memory data structures (Maps/Sets)

### 3.3 Postgres Adapter (Ready)
- [x] Prisma schema design
- [x] Database migrations ready
- [x] PgUserRepo stub implementation
- [x] PgBattleRepo stub implementation
- [x] Transaction support structure

---

## Phase 4: Core Backend Services (3-4 ngày) ✅

### 4.1 User Management
- [x] UserService với repository pattern
- [x] User creation từ SIWS
- [x] Socket binding (`socketId ↔ userId`)
- [x] Online/offline status management

### 4.2 Lobby System
- [x] LobbyService với server-authoritative movement
- [x] Position broadcast (10-15 Hz)
- [x] Chat system với rate limiting
- [x] Emotes system
- [x] Player list management

### 4.3 Matchmaking System
- [x] FIFO queue implementation
- [x] Fairness algorithm (người chờ lâu nhất)
- [x] Timeout handling (60s)
- [x] Room creation logic

### 4.4 Battle System
- [x] Turn-based battle engine
- [x] Random damage calculation (10-60, crit 10%)
- [x] HP management và KO logic
- [x] Level progression (+1 cho winner)
- [x] Battle log system
- [x] AFK timeout (60s)
- [x] Resume on reconnect

---

## Phase 5: Socket Events & Communication (2 ngày) ✅

### 5.1 Event Handlers
- [x] Connection/disconnection handling
- [x] Lobby events (join, move, chat, emote)
- [x] Matchmaking events (join, leave, found, timeout)
- [x] Battle events (start, action, turn, end)

### 5.2 Event Security
- [x] Rate limiting per event type
- [x] Input validation và sanitization
- [x] Idempotency cho battle actions
- [x] JWT authentication cho Socket handshake
- [x] Single-session policy (kick duplicates)

---

## Phase 6: Frontend Game Development (4-5 ngày) ✅

### 6.1 Wallet Integration
- [x] Solana wallet connection
- [x] SIWS flow implementation
- [x] Token management
- [x] Authentication guards

### 6.2 Socket Manager
- [x] Singleton socket client
- [x] Auto-reconnection logic
- [x] Token renewal handling
- [x] Event subscription management

### 6.3 Game Scenes
- [x] **LoadingScene**: Auth flow + asset loading
- [x] **LobbyScene**: Movement, chat, player list, matchmaking
- [x] **BattleScene**: Turn-based UI, HP bars, battle log

### 6.4 Game Mechanics
- [x] Client prediction cho movement
- [x] Position interpolation
- [x] Battle state synchronization
- [x] Scene transition management

---

## Phase 7: Integration & Testing (2-3 ngày) 🚧

### 7.1 Contract Testing
- [x] Repository contract tests (Memory adapter working)
- [ ] Memory vs Postgres adapter tests (Postgres adapters need completion)
- [ ] Transaction boundary tests

### 7.2 E2E Testing
- [x] Authentication flow testing (SIWS working)
- [x] Backend services integration (all services implemented)
- [x] Socket.io connection và authentication
- [x] Frontend-backend API compatibility (fixed API prefix issue)
- [ ] Multiplayer scenarios (need live testing)
- [ ] Battle system testing (need live testing)
- [ ] Reconnection scenarios
- [ ] AFK và timeout testing

### 7.3 Load Testing
- [ ] Concurrent user testing (50-100 users)
- [ ] Socket connection stress test
- [ ] Memory leak detection

---

## Phase 8: Polish & Deployment (1-2 ngày) ⏳

### 8.1 Performance Optimization
- [ ] Battle latency optimization (<200ms)
- [ ] Lobby broadcast optimization
- [ ] Memory usage optimization

### 8.2 Monitoring & Observability
- [ ] Structured logging setup
- [ ] Basic metrics collection
- [ ] Error tracking
- [ ] Health checks

### 8.3 Documentation
- [ ] API documentation
- [ ] Deployment guide
- [ ] Environment setup guide
- [ ] Troubleshooting guide

---

## Timeline Summary

| Phase | Duration | Status | Dependencies |
|-------|----------|--------|--------------|
| Foundation & Setup | 3-4 ngày | ✅ | None |
| Authentication | 2-3 ngày | ⏳ | Phase 1 |
| Storage Adapter | 2 ngày | ✅ | Phase 1 |
| Core Services | 3-4 ngày | ✅ | Phase 2,3 |
| Socket Events | 2 ngày | ✅ | Phase 4 |
| Frontend Game | 4-5 ngày | ✅ | Phase 2,5 |
| Integration & Testing | 2-3 ngày | ⏳ | Phase 6 |
| Polish & Deployment | 1-2 ngày | ⏳ | Phase 7 |

**Status Legend**: ⏳ Pending | 🚧 In Progress | ✅ Complete | ❌ Blocked

---

## Current Focus

**Active Phase**: Phase 7 - Integration & Testing 🚧
**Current Task**: Live testing multiplayer scenarios và battle system
**Next Milestone**: Complete Phase 7 và move to Phase 8 (Polish & Deployment)
**Blocking Issues**: None

**Recent Progress**:
- ✅ Fixed auth endpoints compatibility (added `/auth/siws` endpoint)
- ✅ Fixed frontend API URL với global prefix `/api`
- ✅ Environment configuration setup
- ✅ Both backend và frontend running successfully
- ✅ Authentication endpoints tested và working

**Completed Phases**: 
- ✅ **Phase 1**: Monorepo structure, NestJS backend, Next.js frontend, dependencies installed
- ✅ **Phase 2**: SIWS authentication, JWT tokens, nonce management  
- ✅ **Phase 3**: Storage Adapter pattern, Memory implementation, Postgres ready
- ✅ **Phase 4**: Core services - UserService, LobbyService, MatchmakingService, BattleService
- ✅ **Phase 5**: Socket.io Gateway, event handlers, JWT auth, real-time communication
- ✅ **Phase 6**: Frontend game với Phaser 3, Solana wallet, game scenes, real-time UI

---

## Risk Mitigation

### High Risk
- **Socket.io performance**: Implement rate limiting và backpressure từ đầu
- **Authentication security**: Test thoroughly SIWS implementation
- **State synchronization**: Ensure battle state consistency

### Medium Risk  
- **Adapter pattern complexity**: Start simple, expand gradually
- **Frontend-backend integration**: Regular integration testing
- **Memory leaks**: Profile regularly during development

---

## Success Criteria
- [ ] 50-100 concurrent users stable
- [ ] Battle latency < 200ms
- [ ] Authentication success rate > 99%
- [ ] Zero data loss trong battles
- [ ] Smooth reconnection experience

---

## Notes
- Plan được update theo real-time progress
- Mỗi task complete sẽ được mark ✅
- Blocking issues sẽ được track và resolve
- Timeline có thể adjust dựa trên actual progress
