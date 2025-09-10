# Software Requirements Specification (SRS) — Pokémon Summon Arena (MVP, Auth-Enabled)

**Project**: Pokémon Summon Arena — MVP Edition (Simplified 2D PvP)  
**Frontend**: Next.js 15, Phaser 3, Socket.io client, @solana/wallet-adapter  
**Backend**: NestJS, Socket.io (WebSockets), In-Memory Storage, Ed25519 signature verify (Solana)  
**Development**: pnpm, Docker Compose (optional), Local Dev (hot reload)

> **MVP Focus**: Core gameplay loop with **SIWS-like authentication (Sign-In with Solana)**, simple battle mechanics, real-time lobby. No token economy, no database.

---

## 1. Goals & Scope

### 1.1 MVP Goals

- **Fast prototyping**: Core PvP battle system working in 2–3 weeks.
- **Simple mechanics**: Turn-based battle; random damage and criticals; **win = +1 level**.
- **Real-time multiplayer**: Lobby movement (authoritative server) + turn-based battles.
- **Authentication**: **Mandatory** login by Solana wallet → sign message → backend verify → issue access token → Socket subscribes using token.

### 1.2 In Scope (MVP)

- **User is created at `/auth/siws` (after successful signature). Socket connection is allowed only **after** SIWS; no authenticated user/auto-generated users.**
- Lobby world with avatar movement (Phaser 3).
- Same **default starter creature** for all new users.
- Simple matchmaking (random pairing).
- Turn-based battle with random outcomes.
- Level progression: win = +1 level (max 100 level), loser’s creature **faints** temporarily.
- Real-time chat and emotes in lobby.
- In-memory data persistence (no database).
- **Authentication Flow** (Solana): nonce → sign message on FE → verify on BE → **JWT access token** → Socket handshake with token.

### 1.3 Out of Scope (MVP)

- ❌ Wallet-linked economy (SPL), balances, training costs.
- ❌ Complex stats (Natures/IV/EV), advanced battle mechanics.
- ❌ Database persistence (PostgreSQL/Prisma).
- ❌ MMR-based matchmaking, admin panel, analytics.
- ❌ Mobile polish, SFX/animations beyond basic.

---

## 2. System Overview & Architecture

### 2.1 Architecture

```
[Next.js + Phaser + Wallet Adapter]  -- REST (/auth/*) -->  [NestJS AuthController/AuthService]
         |                                                           |
         |                                                           v
         |<---- Socket.io (handshake with JWT token) ---->     [NestJS Socket Gateway]
                                                                 |          |
                                                                 v          v
                                                           [In-Memory Services]
                                                          (User/Lobby/Match/Battle/Creature)
                                                                 |
                                                                 v
                                                           [Map / Set Storage]
```

### 2.2 Core Backend Services (NestJS)

- **AuthService**: Issue nonce; verify Ed25519 signatures; issue JWT; manage in-memory sessions/nonces.
- **UserService**: Create/find user by wallet; manage online/offline state; attach socket.
- **LobbyService**: Authoritative movement; chat; emotes; broadcast presence/positions.
- **MatchmakingService**: Simple in-memory queue; random pairing; timeout handling.
- **BattleService**: Turn engine; random damage/crit; winner leveling; faint/revive.
- **CreatureService**: Provide default creature; compute max HP by level.

### 2.3 Data Flow (Happy Path)

1. FE connects wallet → `GET /auth/nonce?wallet=…`.
2. FE builds SIWS-like message (includes domain/nonce/issuedAt/expiration) → signs with wallet.
3. FE `POST /auth/siws { wallet, message, signature }` → BE verifies → returns `{ accessToken, user }`.
4. FE opens **Socket.io** with `auth.token = accessToken`.
5. Gateway authenticates socket → associates `socketId` with `userId`.
6. User enters lobby → receives world snapshot → moves, chats, emotes.
7. User clicks “Find Match” → queued → paired with another player.
8. Battle starts → turns alternate → random damage/crit → first to 0 HP loses.
9. Winner gets **+1 level** (≤100). Loser’s creature **faints**, then auto-revives **after battle** with **1 HP** (per MVP rule).
10. Both return to lobby; loop continues.

---

## 3. Functional Requirements

### 3.1 Authentication (Mandatory)

- **FR-A1**: `GET /auth/nonce?wallet=<base58>` returns payload:  
  `{ nonce, domain, statement, issuedAt, expirationTime }`. Nonce TTL 5 minutes, single-use.
- **FR-A2**: FE uses wallet `signMessage()` on SIWS message (UTF-8). Signature base64-encoded.
- **FR-A3**: `POST /auth/siws` with `{ wallet, message, signature }`:
  - Verify Ed25519 signature using wallet public key.
  - Validate: domain match; nonce exists & not used; time window valid.
  - On success: create/find user by wallet; issue **JWT accessToken** (exp 60m); mark nonce used.
- **FR-A4**: Socket handshake **must** include `Authorization: Bearer <accessToken>` header or `auth.token` field.
- **FR-A5**: Gateway validates JWT; assigns `socket.data.userId`; rejects on invalid/expired token.

### 3.2 User Management

- **FR-U1**: On socket connection, **require valid JWT** and resolve `userId` from it. **User must already exist from `/auth/siws`**; reject connection if missing/invalid.
- **FR-U2**: **During `/auth/siws`**, if this is the first login for the wallet, create user and assign default creature at level 1.
- **FR-U3**: Store user in memory & map `socketId ↔ userId` for online presence.
- **FR-U4**: Cleanup on disconnect; clear movement/battle states; notify lobby.

### 3.3 Lobby (Phaser + Server-Authoritative)

- **FR-L1**: Movement rate 10–15 Hz; server clamps speed; broadcasts positions.
- **FR-L2**: Client prediction with interpolation/smoothing on FE.
- **FR-L3**: Chat broadcast; minimal profanity guard (optional MVP).
- **FR-L4**: Emotes: `happy | sad | angry` (visual cue above avatar).
- **FR-L5**: Player list UI: nickname, level, online indicator.

### 3.4 Matchmaking (Random)

- **FR-M1**: FIFO array queue; enqueue on `match.join`, dequeue on `match.leave` or match found.
- **FR-M2**: When ≥2 players, randomly pair two distinct users and create a battle room (`roomId`).
- **FR-M3**: Timeout 60s → emit `match.timeout` → return to lobby.
- **FR-M4**: Prevent duplicate queue entries; handle disconnect in queue gracefully.

### 3.5 Battle System (Random Outcomes)

- **FR-B1**: Turn-based; alternating turns; track `currentTurn` and `turnCount`.
- **FR-B2**: Base damage `randomInt(10, 60)` each attack.
- **FR-B3**: Critical chance 10% → **1.5×** damage multiplier.
- **FR-B4**: HP floors at 0; battle ends when a creature reaches 0 HP.
- **FR-B5**: Winner gains **+1 level** (max 100 level).
- **FR-B6**: Loser’s creature **faints**; **auto-revive with 1 HP** after battle end.
- **FR-B7**: Battle returns both players to lobby; both receive summary event.

### 3.6 Creature System (Basic)

- **FR-C1**: Use a single default creature across all players.
- **FR-C2**: Stats: **HP** (only stat affecting battle), **Level (1–100)**.
- **FR-C3**: Max HP formula: `50 + (level * 5)`.
- **FR-C4**: Level increases only through PvP wins.
- **FR-C5**: Display name/type/description in UI.

### 3.7 Data Persistence (In-Memory)

- **FR-D1**: All data is stored in JS `Map`/`Set`; no external DB.
- **FR-D2**: `users = Map<userId, User>()` and `socketIndex = Map<socketId, userId>()`.
- **FR-D3**: `battles = Map<roomId, Battle>()`; `matchQueue: userId[]`.
- **FR-D4**: `nonces = Map<nonce, NonceRecord>()`; `sessions = Map<jti, SessionRecord>()`.
- **FR-D5**: No persistence across restarts; ensure graceful cleanup on disconnect.

---

## 4. Non-Functional Requirements (NFR)

- **Performance**: Lobby updates at **10–15 Hz**; battle actions < **200 ms** end-to-end; auth verify < **30 ms**.
- **Scalability**: Single node MVP; target **50–100** concurrent users on LAN/localhost.
- **Simplicity**: Minimize code complexity; prioritize readability and speed of delivery.
- **Reliability**: Handle disconnects; queue/battle cleanup; basic error messages.
- **Security**: Nonce one-time use, 5-min TTL; domain binding; JWT exp 60m; minimal PII.

---

## 5. Data Model

### 5.1 User

```ts
interface User {
  id: string; // uuid
  socketId?: string; // present if online
  nickname: string; // "Player1234"
  walletAddress: string; // base58 (Solana)
  position: { x: number; y: number };
  creature: {
    name: string;
    hp: number;
    maxHp: number;
    level: number; // source of truth for level
    isFainted: boolean;
  };
  isInBattle: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}
```

### 5.2 Battle

```ts
interface Battle {
  id: string; // roomId
  player1Id: string; // userId
  player2Id: string; // userId
  currentTurn: "player1" | "player2";
  turnCount: number;
  state: "waiting" | "active" | "ended";
  winnerId?: string;
  createdAt: Date;
  log: string[]; // optional text events
}
```

### 5.3 Base Creature

```ts
interface BaseCreature {
  id: string;
  name: string;
  type: string; // single type
  baseHp: number; // used for initial max HP if needed
  description: string;
}
```

### 5.4 Auth (Nonce/Session)

```ts
type NonceRecord = {
  wallet: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number; // issuedAt + 5m
  used: boolean;
};

type SessionRecord = {
  userId: string;
  tokenId: string; // jti
  issuedAt: number;
  expiresAt: number; // now + 60m
};

const nonces = new Map<string, NonceRecord>(); // key: nonce
const sessions = new Map<string, SessionRecord>(); // key: jti
```

---

## 6. Mechanics & Formulas

### 6.1 HP

- **Max HP**: `50 + (level * 5)`
- **Current HP**: decremented by damage; bounded `[0, maxHp]`.

### 6.2 Damage

- **Base Damage**: random integer [10, 60].
- **Critical**: 10% chance; multiplier **1.5×**.
- **Final Damage** = `baseDamage * (isCrit ? 1.5 : 1.0)` (rounded).

### 6.3 Progression

- **Win**: +1 level (max 100).
- **Lose**: No level change; **faints**.
- **Revival**: Auto after battle; **HP = 1** (MVP rule).

### 6.4 Matchmaking

- **Queue**: FIFO array of userIds.
- **Pairing**: Randomly selects two unique users when possible.
- **Timeout**: 60s → return to lobby with `match.timeout`.

---

## 7. APIs & Events

### 7.1 REST — Authentication

- `GET /auth/nonce?wallet=<base58>`  
  **200** `{ nonce, domain, statement, issuedAt, expirationTime }`
- `POST /auth/siws`  
  **Body** `{ wallet, message, signature }`  
  **200** `{ accessToken, user: { id, nickname, walletAddress, creature } }`  
  **401** on invalid signature/nonce/time window.

**SIWS-like Message Template**

```
Pokémon Summon Arena wants you to sign in with your Solana account:
<wallet-base58>

URI: https://pokemon-arena.local
Domain: pokemon-arena.local
Statement: Sign in to Pokémon Summon Arena
Nonce: <nonce>
Issued At: <ISO8601>
Expiration Time: <ISO8601>
Version: 1
```

### 7.2 Socket.io Handshake

- **Client**:

```ts
const socket = io(SOCKET_URL, {
  auth: { token: accessToken },
  // or: extraHeaders: { Authorization: `Bearer ${accessToken}` }
});
```

- **Server**: Middleware/Guard validates JWT from `auth.token` or `Authorization` header; sets `socket.data.userId`.

### 7.3 Socket Events

**Connection & User**

- `connection` → authenticate via JWT; bind `socketId`; send initial state.
- `disconnect` → cleanup user/socket; notify lobby.

**Lobby**

- `lobby.join` (c→s): enter lobby; server responds with world snapshot.
- `lobby.move` (c→s): `{ direction: 'up'|'down'|'left'|'right' }`
- `lobby.position` (s→c): `{ userId, x, y }`
- `lobby.chat` (c→s): `{ message }`
- `lobby.emote` (c→s): `{ type: 'happy'|'sad'|'angry' }`
- `lobby.update` (s→c): `{ users: Array<{ id, nickname, level, x, y }> }`

**Matchmaking**

- `match.join` (c→s): enqueue current user.
- `match.leave` (c→s): dequeue if present.
- `match.found` (s→c): `{ roomId, opponent: { id, nickname, level } }`
- `match.timeout` (s→c): sent after 60s if unmatched.

**Battle**

- `battle.start` (s→c): `{ roomId, battleState }`
- `battle.action` (c→s): `{ action: 'attack' }` (MVP single action)
- `battle.turn` (s→c): `{ damage, isCrit, targetHp, log }`
- `battle.end` (s→c): `{ winnerId, newLevels: Record<userId, level> }`

---

## 8. Frontend (Next.js + Phaser)

### 8.1 Routes

- `/` — Landing with **Connect Wallet** + **Start Game**.
- `/game` — Full-screen Phaser canvas (Lobby/Battle scenes).

### 8.2 Scenes

- **LoadingScene**: Boot assets; run auth flow; prepare socket.
- **LobbyScene**: Movement, chat, player list, “Find Match” button.
- **BattleScene**: HP bars, action button, turn indicator, battle log.

### 8.3 State & Socket

- React `useState`/`useEffect` for UI; direct Socket.io listeners for game state.
- Interpolation/smoothing for movement display.
- Guard UI if socket/token invalid; re-auth flow on 401.

---

## 9. Backend (NestJS)

### 9.1 Module Structure

```
src/
├── modules/
│   ├── auth/             # nonce, siws, jwt
│   ├── user/             # users service
│   ├── lobby/            # movement/chat/emotes
│   ├── matchmaking/      # queue & pairing
│   ├── battle/           # turn engine
│   └── creature/         # default creature data & helpers
├── gateway/
│   └── socket.gateway.ts # socket events & rooms
├── common/
│   ├── guards/
│   │   └── socket-auth.guard.ts
│   └── utils/
│       └── ed25519.ts    # verify with tweetnacl
├── data/
│   └── creatures.ts      # default creature
└── main.ts
```

### 9.2 In-Memory Storage

```ts
const users = new Map<string, User>(); // userId -> User
const socketIndex = new Map<string, string>(); // socketId -> userId
const battles = new Map<string, Battle>(); // roomId -> Battle
const matchQueue: string[] = []; // userIds (FIFO)
const nonces = new Map<string, NonceRecord>(); // nonce -> NonceRecord
const sessions = new Map<string, SessionRecord>(); // jti -> SessionRecord
```

### 9.3 Auth Notes

- **Nonce**: cryptographically random (24–32 bytes), single-use; TTL 5 minutes.
- **Verify**: `tweetnacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)`; parse & validate domain/nonce/time.
- **JWT**: HS256 (MVP) with `JWT_SECRET`; claims: `{ sub:userId, wal, jti, iat, exp }`; exp 60m.

---

## 10. Development & Deployment

### 10.1 Local Commands

- **Backend**: `pnpm run start:dev` (hot reload)
- **Frontend**: `pnpm run dev` (Next.js hot reload)
- **Optional**: `docker compose up` (FE/BE services)

### 10.2 Environment

```
NODE_ENV=development
DOMAIN=pokemon-arena.local
JWT_SECRET=supersecret
JWT_EXPIRES_IN=3600s
NONCE_TTL_SECONDS=300
SOCKET_URL=ws://localhost:3001
API_URL=http://localhost:3001
```

### 10.3 Project Structure

```
pokemon-arena-mvp/
├── backend/
│   ├── src/
│   ├── package.json
│   └── nest-cli.json
├── frontend/
│   ├── src/
│   ├── package.json
│   └── next.config.js
├── docker-compose.yml (optional)
└── README.md
```

---

## 11. Default Creature Data

```ts
export const defaultCreature = {
  id: "1",
  name: "Flamewyrm",
  type: "Fire",
  baseHp: 60,
  description: "A fiery dragon-like creature that all players start with",
};
```

---

## 12. Testing Strategy

### 12.1 Manual Scenarios

1. **Auth**: Connect wallet → nonce → sign → siws → token.
2. **Socket**: Connect with valid token; reject without/expired token.
3. **Lobby**: Move; others see updates; chat & emotes broadcast.
4. **Matchmaking**: Join → paired (or timeout) → room created.
5. **Battle**: Turns alternate; random damage/crit; win/lose flow; levels update.
6. **Disconnect**: Cleanup from queue/battle; lobby notified.

### 12.2 Unit/Integration (Priority)

- AuthService: nonce lifecycle; signature verify; domain/time checks; JWT claims.
- SocketAuthGuard: accept valid token, reject invalid/expired.
- BattleService: damage range, crit multiplier, HP floor; level up on win.

---

## 13. Acceptance Criteria & Performance Targets

### 13.1 Acceptance

- ✅ Users must authenticate with Solana wallet to join the game.
- ✅ Socket connection requires valid JWT.
- ✅ Lobby supports **10+** concurrent moving users smoothly on LAN.
- ✅ Matchmaking pairs players within **≤30s** (or emits timeout).
- ✅ End-to-end battle works; winner gains level; loser faints & revives at **1 HP**.
- ✅ Chat & emotes function in real-time.
- ✅ Disconnects are handled gracefully (queue/battle cleanup).

### 13.2 Performance

- **Lobby**: 10–15 Hz updates; input-to-broadcast latency < **100 ms** (local).
- **Battle**: Turn response < **200 ms** (local).
- **Auth**: Nonce→token < **1 s** end-to-end.

---

## 14. Future Enhancements (Post-MVP)

- Solana token economy, training costs, and rewards.
- Persistence via Prisma/PostgreSQL; multi-node scaling with Redis adapter.
- Advanced stats (Natures/IV/EV), MMR-based matchmaking.
- Admin tools, analytics, SFX/animations, mobile polish.
- Refresh tokens & silent renew; rate limiting for `/auth/*`.

---

## 15. Risk Mitigation

- **Replay attacks**: One-time nonce + TTL; mark used on success.
- **Phishing**: Domain binding and explicit statement in SIWS message.
- **Token leakage**: Short JWT exp; optional server-side jti revocation via `sessions`.
- **Disconnect races**: Idempotent cleanup; guard null states; room ownership checks.
- **Clock skew**: ±5 minutes tolerance for `issuedAt`.

---

## Appendix A — Verify Signature (Pseudo-code)

```ts
import nacl from "tweetnacl";
import bs58 from "bs58";

export function verifySiws({
  wallet,
  message,
  signature,
}: {
  wallet: string;
  message: string;
  signature: string;
}) {
  const pk = bs58.decode(wallet);
  const sig = Buffer.from(signature, "base64");
  const msg = new TextEncoder().encode(message);

  const ok = nacl.sign.detached.verify(msg, sig, pk);
  if (!ok) return { ok: false, reason: "BAD_SIGNATURE" };

  // Parse Domain, Nonce, Issued At, Expiration Time from `message`
  // 1) Ensure domain === process.env.DOMAIN
  // 2) Nonce exists, not used, not expired
  // 3) Current time within [Issued At - 5m, Expiration Time]
  return { ok: true };
}
```
