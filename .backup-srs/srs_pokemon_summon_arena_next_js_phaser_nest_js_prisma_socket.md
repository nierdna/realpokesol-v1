# Software Requirements Specification (SRS)

**Project**: Pokémon Summon Arena — 2D PvP (inspired by Gen‑IV mechanics)

**Frontend**: Next.js 15, Phaser 3, Socket.io client, Solana Wallet Adapter  
**Backend**: NestJS, Prisma (PostgreSQL), Socket.io (WebSockets), Redis (pub/sub + rate limit)  
**Infra**: PostgreSQL, Redis, Object Storage (for avatars), CI/CD (GitHub Actions), Vercel (FE), Fly.io/Railway (BE)

> Notes: All names, mechanics, and formulas are *inspired by* Gen‑IV but are original re‑implementations with our own data and balancing.

---

## 1. Goals & Scope

### 1.1 Product Goals
- Fast, fair 1v1 PvP battles with simple progression: **win = +1 level**.
- **Anti‑P2W** economy: RNG training can fail, diminishing effect at high levels; balanced matchmaking.
- Smooth onboarding with Solana wallet connect and initial grant of 1000 SPL tokens (off‑chain balance tracked server‑side, optionally mirrored on‑chain later).

### 1.2 In Scope (MVP)
- Lobby world (free‑roam avatars), auto matchmaking, 1v1 turn‑based combat.
- Creature system: Base Stats, Natures (+10% / −10%), Lv 1–100, fainting & revival.
- Economy: free first 3 summons, 100 SPL per summon thereafter, 100 SPL per training attempt, revival tickets cost by formula.
- Wallet auth (SIWS: Sign‑In With Solana), avatar creation, basic chat/emotes.

### 1.3 Out of Scope (MVP)
- Guilds/parties, trading between players, on‑chain battle outcomes, multi‑language UI, spectating.

---

## 2. System Overview & Architecture

### 2.1 High‑Level Diagram
```
[Next.js + Phaser] --(WS: Socket.io)--> [NestJS Gateway]
        |                               |\
  (REST) |                               |  \---> Redis (pub/sub, rate limit, socket adapter)
        v                               v
   [REST API]  <-------------------->  [Services + Prisma] <--> PostgreSQL
        |
        v
 [Solana Wallet Adapter] -- SIWS --> [Auth Service]
```

### 2.2 Key Services (NestJS)
- **Auth Service**: SIWS (nonce, signature verify), session JWT, replay protection.
- **Player/Lobby Service**: avatar CRUD, movement, emotes, chat; server‑authoritative position updates.
- **Matchmaking Service**: queue, rating (MMR = Level + WeightedStats), fairness constraints.
- **Battle Service**: turn engine, damage calc, RNG (server‑seeded), status, win/lose resolution.
- **Creature Service**: base data, natures, user creatures, leveling, fainting, revival.
- **Economy Service**: SPL balance (off‑chain ledger), transactions (grant, summon, train, revive), anti‑abuse.

### 2.3 Data Flow
1. Wallet connects → SIWS challenge → JWT issued.  
2. On first login, Economy Service credits **1000 SPL** (off‑chain ledger).  
3. Player enters lobby (WS): receives world snapshot; server tick broadcasts positions/emotes.  
4. Player hits Match → enters queue → match found → battle room created (private WS room).  
5. Battle resolves (turns) → result applied (level up or faint) → economy/ledger updates.

---

## 3. Functional Requirements

### 3.1 Authentication (SIWS)
- **FR‑A1**: Provide `/auth/nonce` to mint a nonce.
- **FR‑A2**: `/auth/siws` verifies signature (address, nonce), issues JWT (15m) + refresh (7d).
- **FR‑A3**: Nonce single‑use with expiry (5m); store last nonces to prevent replay.

### 3.2 Onboarding & Avatar
- **FR‑O1**: On first login, credit **1000 SPL** to user’s ledger.
- **FR‑O2**: `POST /users/avatar` creates an avatar with default image (user‑upload optional).  
- **FR‑O3**: Avatars appear in lobby with nickname, emotes, simple chat.

### 3.3 Lobby (Phaser world)
- **FR‑L1**: Client sends input intents (up/down/left/right, emote). Server simulates authoritative movement.
- **FR‑L2**: Random idle behaviors for non‑moving avatars.
- **FR‑L3**: WS events: `lobby.state`, `lobby.move`, `lobby.emote`, `lobby.chat`.

### 3.4 Matchmaking (1v1)
- **FR‑M1**: MMR = Level + WeightedStats (configurable weights per stat).  
- **FR‑M2**: Queue buckets by MMR bands; widen search window over time (e.g., ±25, ±50, ±100).
- **FR‑M3**: Avoid repeats and hard counters where possible.
- **FR‑M4**: Emit `match.found`, `match.cancelled`, `match.timeout`.

### 3.5 Battle System (Turn‑based)
- **FR‑B1**: Speed check decides turn order (higher SPD acts first).  
- **FR‑B2**: Damage formula (rút gọn Gen‑IV):  
  `Damage = (((2*Level/5 + 2) * Power * A/D) / 50 + 2) * Mod`  
  where `Mod = STAB × TypeEffectiveness × Crit × Random(0.85–1.0)`.
- **FR‑B3**: A/D uses ATK vs DEF or SPATK vs SPDEF based on move category.
- **FR‑B4**: On win: **+1 level** to the winning creature. On loss: HP→0 (faint).
- **FR‑B5**: WS events: `battle.start`, `battle.turn.submit`, `battle.turn.result`, `battle.end`.

### 3.6 Creature System
- **FR‑C1**: Base stats: HP, ATK, DEF, SPATK, SPDEF, SPD; Nature (+10% / −10%) applied to non‑HP stats.  
- **FR‑C2**: **Level range 1–100**.  
- **FR‑C3**: **Level‑up**: winning a PvP battle increments level by 1 (cap at 100).  
- **FR‑C4**: **RNG Training**: spend **100 SPL** → +0..3 random levels by configured distribution; reduced success above Lv70.
- **FR‑C5**: **Fainting/Revival**: on HP=0 → graveyard. Revival requires a **Resurrection Ticket** priced:  
  `Cost (SPL) = Level * 10 + BST/2` (BST = sum of base stats).  
- **FR‑C6**: Provide **10 default Level‑1 creatures** seeded from CSV (`10_Default_Creatures_at_Level_1.csv`).

### 3.7 Economy & Ledger
- **FR‑E1**: Off‑chain SPL ledger with transaction records (type, amount, balance before/after).
- **FR‑E2**: Grant rules: first login +1000 SPL; **3 free summons**; summon 4+ costs **100 SPL**.
- **FR‑E3**: Training costs **100 SPL**; can fail or give +1..+3 levels.
- **FR‑E4**: Revival costs as formula above; consumes ticket; logs transaction.
- **FR‑E5**: Optional: on‑chain proof (future): withdraw/deposit to real SPL via Solana program.

---

## 4. Non‑Functional Requirements (NFR)
- **NFR‑1 Performance**: Lobby tick 10–15 Hz; battle rooms <150ms p95 input‑to‑apply (SEA region baseline).
- **NFR‑2 Scalability**: Horizontal scale via Redis‑backed Socket.io adapter; stateless NestJS pods.
- **NFR‑3 Security**: SIWS, JWT, CSRF‑free (API is same‑origin), TLS enforced; server‑authoritative movement & RNG.
- **NFR‑4 Fairness/Anti‑Cheat**: Input rate limit, position sanity checks, seed‑based RNG on server, tamper‑proof results.
- **NFR‑5 Observability**: Structured logs (pino), metrics (Prometheus), tracing (OpenTelemetry).
- **NFR‑6 Compliance**: COPPA‑style age gate (if needed), ToS/Privacy, asset licensing.

---

## 5. Data Model (Prisma)

### 5.1 Entities
- **User**(id, walletAddress, nickname, avatarUrl, createdAt)
- **LedgerTx**(id, userId, type: GRANT|SUMMON|TRAIN|REVIVE|WITHDRAW|DEPOSIT, delta, balanceAfter, meta, createdAt)
- **Nature**(id, name, upStat, downStat, modUp=1.1, modDown=0.9)
- **BaseCreature**(id, name, type1, type2?, baseHP, baseATK, baseDEF, baseSPATK, baseSPDEF, baseSPD, BST)
- **UserCreature**(id, userId, baseCreatureId, level, natureId, isFainted, createdAt)
- **Battle**(id, p1UserId, p2UserId, winnerUserId?, createdAt, durationMs)
- **BattleTurn**(id, battleId, turnNo, actorUserId, moveId, damage, crit, effectiveness, rng, createdAt)
- **MatchQueue**(id, userId, mmr, enqueuedAt)
- **Summon**(id, userId, baseCreatureId, cost, createdAt)
- **TrainingAttempt**(id, userId, userCreatureId, cost, levelGain, success, createdAt)
- **Revival**(id, userId, userCreatureId, cost, createdAt)

### 5.2 Notes
- **BST** precomputed on `BaseCreature`; formula used in revival pricing.
- Consider **MMRHistory** for analytics.

---

## 6. Mechanics & Formulas

### 6.1 Stat Computation (no IV/EV in MVP)
- **HP (Lv, Base)**:  
  `HP = floor(((2*Base)*Level)/100) + Level + 10`
- **Other Stats**:  
  `Stat = floor((((2*Base)*Level)/100) + 5) × NatureMod`  
  where `NatureMod ∈ {1.1, 0.9, 1.0}` depending on nature.

### 6.2 Damage
`Damage = (((2*Level/5 + 2) * Power * A/D) / 50 + 2) × STAB × TypeEff × Crit × Random`
- **Crit**: 1.5  
- **Random**: uniform [0.85, 1.0]
- **STAB**: 1.5 if move type matches creature type

### 6.3 Matchmaking MMR
`MMR = Level + wHP*HP + wATK*ATK + wDEF*DEF + wSPA*SPATK + wSPD*SPDEF + wSPE*SPD`  
Weights configurable; default very small (e.g., 0.01 per point) so level dominates early.

### 6.4 RNG Training Distribution (configurable)
- Lv < 50: P(+0)=20%, P(+1)=45%, P(+2)=25%, P(+3)=10%
- 50 ≤ Lv < 70: 30%, 45%, 20%, 5%
- 70 ≤ Lv: 45%, 40%, 13%, 2%

### 6.5 Revival Cost
`Cost (SPL) = Level*10 + BST/2` (rounded up).

---

## 7. APIs (REST)

**Auth**
- `GET /auth/nonce` → `{ nonce }`
- `POST /auth/siws` body: `{ address, signature, nonce }` → `{ accessToken, refreshToken }`
- `POST /auth/refresh` → new access token

**Users/Avatar**
- `POST /users/avatar` body: `{ nickname, avatarUrl? }`
- `GET /users/me` → profile + balances + roster

**Creatures**
- `GET /creatures/base` (list base creatures)
- `POST /creatures/summon` → consumes free quota or 100 SPL; returns new `UserCreature`
- `POST /creatures/train` body: `{ userCreatureId }` → costs 100 SPL; returns levelGain
- `POST /creatures/revive` body: `{ userCreatureId }` → costs ticket per formula

**Matchmaking / Battle**
- `POST /match/join` → queued
- `POST /match/leave`
- `GET /battle/:id` → battle summary

**Economy**
- `GET /ledger` → paginated transactions

---

## 8. WebSocket (Socket.io) Events

**Lobby**
- `lobby.state` → { players[] }
- `lobby.move` (client→server): { dir, ts }
- `lobby.emote` (client→server): { type }
- `lobby.chat` (client→server): { message }

**Matchmaking**
- `match.found` → { roomId, opponent }
- `match.cancelled`, `match.timeout`

**Battle**
- `battle.start` → { roomId, snap }
- `battle.turn.submit` (client→server): { action, target }
- `battle.turn.result` → { damage, crit, eff, rng, hpAfter }
- `battle.end` → { winner, rewards }
- `creature.fainted`, `creature.levelup`, `token.changed`

---

## 9. Frontend (Next.js + Phaser)

### 9.1 Pages/Routes
- `/` Landing + Connect Wallet
- `/lobby` (Phaser canvas): world viewport (drag to pan), player list, chat/emotes
- `/roster` My creatures, summon/train/revive actions
- `/battle/:id` Battle UI (turn selector, log, animations)

### 9.2 State & Networking
- Zustand/Redux for UI state; Socket.io for real‑time; React Query for REST.
- Movement is client‑predicted, server‑reconciled; rubber‑band if divergence.

### 9.3 Wallet & Auth
- Solana Wallet Adapter (Phantom, Backpack, etc.), SIWS flow → JWT stored in memory; refresh via silent call.

---

## 10. Backend (NestJS)

### 10.1 Modules
- `AuthModule`, `UsersModule`, `LobbyModule`, `MatchModule`, `BattleModule`, `CreaturesModule`, `EconomyModule`

### 10.2 Gateway
- `WsGateway` namespaces: `/lobby`, `/battle` with rooms per match.

### 10.3 RNG & Determinism
- Server generates a per‑battle seed; all random rolls derive from it; audit logged.

### 10.4 Rate Limits & Anti‑Cheat
- Token bucket per socket (movement, chat, actions).  
- Movement validation: max speed per tick, collision map checks.

---

## 11. Configuration & Constants
- `MAX_LEVEL = 100`
- `INITIAL_GRANT = 1000` SPL
- `SUMMON_COST = 100` SPL (from 4th+)
- `TRAIN_COST = 100` SPL
- RNG distributions by level band (see §6.4)
- MMR weights (default low weights for stats)

---

## 12. Seed & Content Pipeline
- Import **10 default Level‑1 creatures** from `10_Default_Creatures_at_Level_1.csv` at bootstrap:
  - Columns: name, type1, type2?, baseHP, baseATK, baseDEF, baseSPATK, baseSPDEF, baseSPD
  - Compute BST; attach random Nature on summon if not specified.
- Store default avatar(s) in object storage; return URL at creation.

---

## 13. Telemetry & Admin
- Admin endpoints: invalidate user, credit/debit SPL (manual), ban hammer, inspect battles.
- Metrics: matches/min, battle latency, lobby tick time, WS errors, queue time p50/p95.

---

## 14. Deployment & Environments
- **Dev**: Docker compose (NestJS, Postgres, Redis).  
- **Staging/Prod**:
  - FE on Vercel; BE on Fly.io/Railway (sticky sessions **not required** with Redis adapter).
  - Postgres (Neon/Supabase), Redis (Upstash/Valkey cluster).  
- Secrets via `.env` / platform vars.

---

## 15. Risks & Mitigations
- **Matchmaking queue starvation** → widen MMR window over time; allow bots for testing.
- **P2W perception** → strict RNG caps at high levels; publish odds; visible logs.
- **Network variance** → server reconciliation; SEA region proximity; p95 SLOs.

---

## 16. Future Work
- On‑chain escrow for entry fees / on‑chain rewards.
- Spectator mode & ranked seasons.
- Multi‑creature squads (2v2) and skills/status conditions.
- Cosmetics marketplace and battle replays on CDN.

---

## 17. Acceptance Criteria Summary
- Wallet connect + SIWS works; new user gets **1000 SPL** once.
- Lobby shows >50 players moving with ≤150ms p95 action latency.
- Matchmaking pairs players within ±100 MMR within 60s (test env).
- Battle loop accurate to formulas; win = +1 level; loss = faint.
- Summon/training/revival consume SPL per rules; 3 free summons enforced.
- DB seeded with 10 default Level‑1 creatures; CRUD and calculations verified.

