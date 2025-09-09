# Software Requirements Specification (SRS) — Pokémon Summon Arena (MVP, Auth-Enabled, Event-Driven)

**Project**: Pokémon Summon Arena — MVP Edition (Simplified 2D PvP)  
**Frontend**: Next.js 15, Phaser 3, Socket.io client, @solana/wallet-adapter  
**Backend**: NestJS, Socket.io (WebSockets), In-Memory Storage, Ed25519 signature verify (Solana)  
**Development**: pnpm, Docker Compose (optional), Local Dev (hot reload)

> **MVP Focus**: Core gameplay loop với **SIWS-like authentication (Sign-In with Solana)** bắt buộc, cơ chế battle đơn giản, lobby real-time. **Không** có token economy, **không** có database.

---

## 1. Goals & Scope

### 1.1 MVP Goals
- **Fast prototyping**: Core PvP battle chạy được trong 2–3 tuần.
- **Simple mechanics**: Turn-based battle; random damage & crit; **win = +1 level**.
- **Real-time multiplayer**: Lobby movement (server-authoritative) + turn-based battles.
- **Authentication**: **Bắt buộc** đăng nhập bằng Solana wallet (SIWS) → backend verify → issue access token → Socket chỉ connect sau khi SIWS thành công.

### 1.2 In Scope (MVP)
- **User được tạo tại `/auth/siws`** (sau khi ký message hợp lệ). Socket **chỉ** được phép connect **sau** SIWS; **không có guest/auto-generated**.
- Lobby world với avatar movement (Phaser 3).
- Starter creature mặc định cho user mới.
- Matchmaking đơn giản (random pairing).
- Battle turn-based với kết quả random.
- Level progression: win = +1 level (cap 100); kẻ thua **faint** tạm thời.
- Chat & emotes real-time trong lobby.
- In-memory data (không DB).
- **Auth Flow** (Solana): nonce → FE ký message → BE verify → **JWT access token** → Socket handshake với token.

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
- **AuthService**: Cấp nonce; verify chữ ký Ed25519; issue JWT; quản lý nonces/sessions (in-memory).
- **UserService**: Tạo/tìm user theo wallet; quản lý online/offline; attach socket.
- **LobbyService**: Authoritative movement; chat; emotes; broadcast presence/positions.
- **MatchmakingService**: Hàng đợi in-memory; random pairing; timeout.
- **BattleService**: Turn engine; random damage/crit; winner leveling; faint/revive.
- **CreatureService**: Default creature; tính max HP theo level.

### 2.3 Data Flow (Happy Path)
1. FE connect wallet → `GET /auth/nonce?wallet=…`.  
2. FE build SIWS message (domain/nonce/issuedAt/expiration) → ký bằng wallet.  
3. FE `POST /auth/siws { wallet, message, signature }` → BE verify → `{ accessToken, user }`.  
4. FE mở **Socket.io** với `auth.token = accessToken`.  
5. Gateway authenticate → bind `socketId ↔ userId` → user vào lobby.  
6. User `Find Match` → vào queue → ghép cặp → `battle.start` → battle theo lượt.  
7. Kết thúc: Winner +1 level; loser faint → revive (HP=1) sau battle → trở về lobby.

---

## 3. Functional Requirements

### 3.1 Authentication (Mandatory)
- **FR-A1**: `GET /auth/nonce?wallet=<base58>` trả: `{ nonce, domain, statement, issuedAt, expirationTime }`. Nonce TTL 5 phút, one-time.
- **FR-A2**: FE ký SIWS message (UTF-8). Signature base64-encoded.
- **FR-A3**: `POST /auth/siws { wallet, message, signature }`:
  - Verify Ed25519 bằng public key (wallet).
  - Validate domain; nonce tồn tại & chưa dùng; thời gian hợp lệ.
  - Thành công: tạo/tìm user theo wallet; issue **JWT accessToken** (exp 60m); mark nonce used.
- **FR-A4**: Socket handshake **bắt buộc** có token (`Authorization: Bearer <token>` hoặc `auth.token`).
- **FR-A5**: Gateway verify JWT → set `socket.data.userId`; reject nếu invalid/expired.

### 3.2 User Management
- **FR-U1**: Khi socket kết nối, **yêu cầu JWT hợp lệ** và resolve `userId` từ token. **User phải tồn tại từ `/auth/siws`**; từ chối nếu thiếu/invalid.
- **FR-U2**: **Trong `/auth/siws`**, nếu lần đầu login của wallet → tạo user & gán default creature level 1.
- **FR-U3**: Lưu user in-memory; map `socketId ↔ userId` khi online.
- **FR-U4**: Cleanup khi disconnect; giải phóng queue/battle; broadcast cập nhật lobby.

### 3.3 Lobby (Phaser + Server-Authoritative)
- **FR-L1**: Movement tick 10–15 Hz; server clamp speed; broadcast positions.
- **FR-L2**: Client prediction + interpolation (FE).
- **FR-L3**: Chat broadcast; emotes (`happy|sad|angry`).
- **FR-L4**: Player list: nickname, level, online indicator.

### 3.4 Matchmaking (Random)
- **FR-M1**: FIFO queue (userIds); `match.join`/`match.leave` idempotent.
- **FR-M2**: Khi ≥2 user → random pair → tạo `roomId` → emit `match.found` cho cả hai.
- **FR-M3**: Timeout 60s → `match.timeout` → trở lại lobby.
- **FR-M4**: Xử lý disconnect trong queue/battle an toàn.

### 3.5 Battle System (Random Outcomes)
- **FR-B1**: Alternating turns; track `currentTurn` & `turnCount`.
- **FR-B2**: Damage mỗi đòn: `randomInt(10, 60)`.
- **FR-B3**: Crit 10% → multiplier **1.5×**.
- **FR-B4**: HP min 0; KO khi 0.
- **FR-B5**: Winner **+1 level** (cap 100).
- **FR-B6**: Loser **faint**; **auto-revive với 1 HP** sau khi battle kết thúc.
- **FR-B7**: Emit `battle.end` → FE quay về lobby → đồng bộ lại snapshot/level.

### 3.6 Creature System (Basic)
- **FR-C1**: Một default creature dùng chung.
- **FR-C2**: Stats: **HP** & **Level (1–100)**.
- **FR-C3**: Max HP: `50 + (level * 5)`.
- **FR-C4**: Level chỉ tăng qua PvP wins.
- **FR-C5**: UI hiển thị name/type/description.

### 3.7 Data Persistence (In-Memory)
- **FR-D1**: JS `Map`/`Set`; không DB.
- **FR-D2**: `users = Map<userId, User>()`; `socketIndex = Map<socketId, userId>()`.
- **FR-D3**: `battles = Map<roomId, Battle>()`; `matchQueue: userId[]`.
- **FR-D4**: `nonces = Map<nonce, NonceRecord>()`; `sessions = Map<jti, SessionRecord>()`.
- **FR-D5**: Không persist qua restart; cleanup graceful.

---

## 4. Non-Functional Requirements (NFR)
- **Performance**: Lobby 10–15 Hz; battle < **200 ms**; auth verify < **30 ms**.
- **Scalability**: Single node MVP; mục tiêu **50–100** concurrent users (LAN).
- **Simplicity**: Code dễ đọc, ưu tiên tốc độ build.
- **Reliability**: Handle disconnect; cleanup queue/battle; errors thân thiện.
- **Security**: Nonce one-time 5m; domain binding; JWT exp 60m; tối thiểu PII.

---

## 5. Data Model

### 5.1 User
```ts
interface User {
  id: string;                    // uuid
  socketId?: string;             // present if online
  nickname: string;              // "Player1234"
  walletAddress: string;         // base58 (Solana)
  position: { x: number; y: number };
  creature: {
    name: string;
    hp: number;
    maxHp: number;
    level: number;               // source of truth for level
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
  id: string;                       // roomId
  player1Id: string;                // userId
  player2Id: string;                // userId
  currentTurn: 'player1' | 'player2';
  turnCount: number;
  state: 'waiting' | 'active' | 'ended';
  winnerId?: string;
  createdAt: Date;
  log: string[];                    // optional text events
}
```

### 5.3 Base Creature
```ts
interface BaseCreature {
  id: string;
  name: string;
  type: string;                     // single type
  baseHp: number;                   // used for initial max HP if needed
  description: string;
}
```

### 5.4 Auth (Nonce/Session)
```ts
type NonceRecord = {
  wallet: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;  // issuedAt + 5m
  used: boolean;
};

type SessionRecord = {
  userId: string;
  tokenId: string;    // jti
  issuedAt: number;
  expiresAt: number;  // now + 60m
};

const nonces   = new Map<string, NonceRecord>();     // key: nonce
const sessions = new Map<string, SessionRecord>();   // key: jti
```

---

## 6. Mechanics & Formulas

### 6.1 HP
- **Max HP**: `50 + (level * 5)`  
- **Current HP**: giảm bởi damage; bound `[0, maxHp]`.

### 6.2 Damage
- **Base Damage**: số nguyên random [10, 60].
- **Critical**: 10% → multiplier **1.5×**.
- **Final Damage** = `baseDamage * (isCrit ? 1.5 : 1.0)` (rounded).

### 6.3 Progression
- **Win**: +1 level (max 100).
- **Lose**: No level change; **faint**.
- **Revival**: Auto sau battle; **HP = 1** (MVP rule).

### 6.4 Matchmaking
- **Queue**: FIFO userIds.
- **Pairing**: Random 2 user khi đủ.
- **Timeout**: 60s → `match.timeout`.

---

## 7. APIs & Events

### 7.1 REST — Authentication
- `GET /auth/nonce?wallet=<base58>`  
  **200** `{ nonce, domain, statement, issuedAt, expirationTime }`
- `POST /auth/siws`  
  **Body** `{ wallet, message, signature }`  
  **200** `{ accessToken, user: { id, nickname, walletAddress, creature } }`  
  **401** invalid signature/nonce/time window.

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
- **Server**: Middleware/Guard validate JWT từ `auth.token` hoặc header; set `socket.data.userId`.

### 7.3 Socket Events

**Connection & User**
- `connection` → authenticate via JWT; bind `socketId`; send initial state.
- `disconnect` → cleanup user/socket; notify lobby.

**Lobby**
- `lobby.join` (c→s): vào lobby; server trả snapshot.
- `lobby.move` (c→s): `{ direction: 'up'|'down'|'left'|'right' }`
- `lobby.position` (s→c): `{ userId, x, y }`
- `lobby.chat` (c→s): `{ message }`
- `lobby.emote` (c→s): `{ type: 'happy'|'sad'|'angry' }`
- `lobby.update` (s→c): `{ users: Array<{ id, nickname, level, x, y }> }`

**Matchmaking**
- `match.join` (c→s): enqueue
- `match.leave` (c→s): dequeue
- `match.found` (s→c): `{ roomId, opponent: { id, nickname, level } }`
- `match.timeout` (s→c): thông báo hết hạn

**Battle**
- `battle.start` (s→c): `{ roomId, battleState }`
- `battle.action` (c→s): `{ action: 'attack' }` (MVP)
- `battle.turn` (s→c): `{ damage, isCrit, targetHp, log }`
- `battle.end` (s→c): `{ winnerId, newLevels }`

---

## 8. Frontend (Next.js + Phaser)

### 8.1 Routes
- `/` — Landing: **Connect Wallet** + **Start Game**.
- `/game` — Full-screen Phaser canvas (Lobby/Battle scenes).

### 8.2 Scenes
- **LoadingScene**: Boot assets; chạy auth flow; chuẩn bị socket.
- **LobbyScene**: Movement, chat, player list, “Find Match” button.
- **BattleScene**: HP bars, action button, turn indicator, battle log.

### 8.3 State & Socket
- React `useState`/`useEffect` cho UI; Socket.io listeners cho game state.
- Interpolation/smoothing cho movement display.
- Guard UI nếu socket/token invalid; re-auth khi 401.

### 8.4 Client Connection Lifecycle & Scene Subscriptions (Event-Driven Detail)

**Nguyên tắc**: Tạo **một** Socket.IO client cho toàn app (singleton). **Không** disconnect khi chuyển page/scene. Scene/component chỉ **subscribe/unsubscribe** listener để tránh leak & duplicate.

- **Socket Singleton**: `socketManager` giữ socket (`reconnection: true`, `autoConnect: false`). Methods: `create(token)`, `setToken(token)`, `connect()`, `disconnect()`, `on()`, `off()`, `emit()`.
- **Provider at App Root**: Giữ socket ở context/layout gốc để React unmount không làm mất kết nối.
- **Scene Lifecycle**:
  - `scene.create()`: đăng ký listener cần thiết.
  - `scene.shutdown()/destroy()`: `off()` tất cả listener của scene.
  - Không gọi `disconnect()` khi rời scene; chỉ dùng khi **Logout**.

**Khi nào disconnect**: Chỉ khi **Logout** hoặc app exit. Mất mạng → rely auto-reconnect.

---

### 8.5 End-to-End Event Timeline (Login → Socket → Lobby → Match → Battle)

1) **Login (SIWS)**  
   - FE: `GET /auth/nonce?wallet=...` → ký SIWS → `POST /auth/siws`.  
   - BE: verify Ed25519; nếu lần đầu → tạo user; trả `{ accessToken }`.  
   - FE: `socketManager.create(accessToken)`.

2) **Connect Socket (sau SIWS)**  
   - FE: `socketManager.connect()` với `auth.token = accessToken`.  
   - BE: verify JWT; bind `socketId ↔ userId`; gửi initial state (hoặc chờ `lobby.join`).

3) **Join Lobby**  
   - FE (Loading/LobbyScene): `emit('lobby.join')` để vào room & xin snapshot.  
   - BE: join room lobby; `lobby.update` snapshot.

4) **Matchmaking**  
   - FE (LobbyScene): `emit('match.join')`.  
   - BE: đủ 2 user → random pair → tạo `roomId` → `match.found`.  
   - FE: nhận `match.found` → chuyển **BattleScene**.

5) **Battle**  
   - BE: `battle.start`.  
   - FE (BattleScene): render HUD; tới lượt → `battle.action { attack }`.  
   - BE: damage/crit → `battle.turn`; KO → `battle.end`.  
   - FE: hiển thị kết quả → quay **LobbyScene** → `emit('lobby.join')` để refresh.

6) **Reconnect / Token refresh**  
   - Network drop: auto-reconnect.  
   - `connect_error` 401: chạy lại SIWS → `socketManager.setToken(newToken)` → `connect()`.  
   - Scene re-entry phải đăng ký listener lại; đảm bảo `off()` khi thoát scene.

---

### 8.6 Per-Screen Subscriptions (Listen/Emit/Unsubscribe)

**LoadingScene (boot & connect)**  
- **Listen**:  
  - `connect` → sau khi connected, `emit('lobby.join')`.  
  - `connect_error` → nếu 401, SIWS lại → `setToken()` → `connect()`.
  - `disconnect` → hiển thị “Reconnecting…”.  
- **Emit**: (tuỳ) `lobby.join` sau connect.  
- **Unsubscribe**: `off('connect')`, `off('connect_error')`, `off('disconnect')`.

**LobbyScene (movement/chat/matchmaking)**  
- **Listen**:  
  - `lobby.update` → `{ users: {id,nickname,level,x,y}[] }`  
  - `lobby.position` → `{ userId, x, y }`  
  - `match.found` → `{ roomId, opponent }`  
  - `match.timeout`  
  - (optional) echo `lobby.chat`
- **Emit**:  
  - On enter: `lobby.join` (nếu chưa gửi)  
  - 10–15 Hz: `lobby.move { direction }`  
  - `lobby.chat { message }`, `lobby.emote { type }`  
  - `match.join` / `match.leave`
- **Unsubscribe**: `off('lobby.update')`, `off('lobby.position')`, `off('match.found')`, `off('match.timeout')`, `off('lobby.chat')`.

**BattleScene (turn-based)**  
- **Listen**:  
  - `battle.start` → `{ roomId, battleState }`  
  - `battle.turn`  → `{ damage, isCrit, targetHp, log }`  
  - `battle.end`   → `{ winnerId, newLevels }`
- **Emit**:  
  - Lượt người chơi: `battle.action { action:'attack' }`  
  - Sau `battle.end` khi về lobby: `lobby.join` để refresh snapshot
- **Unsubscribe**: `off('battle.start')`, `off('battle.turn')`, `off('battle.end')`.

> **Important**: Đổi scene **không** gọi `disconnect()`. Chỉ gỡ listener của scene cũ.

---

### 8.7 Connection Management: Reconnect & Token Renewal

- **Auto-Reconnect**: bật mặc định Socket.IO; hiển thị indicator khi reconnecting.
- **Token Renewal** (401 khi handshake):  
  1) Chạy lại SIWS để lấy `newToken`.  
  2) `socketManager.setToken(newToken)` (không tạo socket mới).  
  3) `socketManager.connect()` để retry handshake.  
- **Idempotency**: Mỗi scene giữ registry listener cục bộ; `off()` khi shutdown để tránh nhân đôi handler sau reconnect.

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
const users       = new Map<string, User>();        // userId -> User
const socketIndex = new Map<string, string>();      // socketId -> userId
const battles     = new Map<string, Battle>();      // roomId -> Battle
const matchQueue: string[] = [];                    // userIds (FIFO)
const nonces      = new Map<string, NonceRecord>(); // nonce -> record
const sessions    = new Map<string, SessionRecord>(); // jti -> record
```

### 9.3 Auth Notes
- **Nonce**: random 24–32 bytes; TTL 5 phút; 1 lần dùng.
- **Verify**: `tweetnacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)`; parse/validate domain/nonce/time.
- **JWT**: HS256 (MVP) `JWT_SECRET`; claims: `{ sub:userId, wal, jti, iat, exp }`; exp 60m.

---

## 10. Development & Deployment

### 10.1 Local Commands
- **Backend**: `pnpm run start:dev`  
- **Frontend**: `pnpm run dev`  
- **Optional**: `docker compose up`

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
  id: '1',
  name: 'Flamewyrm',
  type: 'Fire',
  baseHp: 60,
  description: 'A fiery dragon-like creature that all players start with',
};
```

---

## 12. Testing Strategy

### 12.1 Manual Scenarios
1. **Auth**: wallet → nonce → sign → siws → token.
2. **Socket**: connect với token; reject khi thiếu/expired.
3. **Lobby**: move; others see updates; chat & emotes.
4. **Matchmaking**: join → paired (hoặc timeout) → room created.
5. **Battle**: turns; random damage/crit; win/lose; level update.
6. **Disconnect**: cleanup queue/battle; lobby notified.

### 12.2 Unit/Integration (Priority)
- AuthService: nonce lifecycle; signature verify; domain/time checks; JWT claims.
- SocketAuthGuard: accept valid token; reject invalid/expired.
- BattleService: damage range; crit; HP floor; level up on win.

---

## 13. Acceptance Criteria & Performance Targets

### 13.1 Acceptance
- ✅ User **bắt buộc** SIWS và nhận **access token** trước khi socket connect.  
- ✅ Socket chỉ kết nối khi token hợp lệ.  
- ✅ Lobby ≥ **10** concurrent users mượt (LAN).  
- ✅ Matchmaking ≤ **30s** (hoặc timeout).  
- ✅ Battle end-to-end; winner lên level; loser faint & revive **HP=1**.  
- ✅ Chat & emotes real-time.  
- ✅ Disconnects được xử lý gọn (cleanup queue/battle).

### 13.2 Performance
- **Lobby**: 10–15 Hz; input→broadcast < **100 ms** (local).  
- **Battle**: turn response < **200 ms** (local).  
- **Auth**: nonce→token < **1 s** end-to-end.

---

## 14. Future Enhancements (Post-MVP)
- SPL economy & training costs.
- Persistence (Prisma/PostgreSQL); scale multi-node bằng Redis adapter.
- Advanced stats (Natures/IV/EV), MMR.
- Admin/analytics, SFX/animations, mobile polish.
- Refresh tokens & silent renew; rate-limiting `/auth/*`.

---

## 15. Risk Mitigation
- **Replay**: Nonce one-time + TTL; mark used.  
- **Phishing**: Domain binding + explicit statement trong SIWS message.  
- **Token leak**: JWT exp ngắn; optional revoke theo `jti`.  
- **Disconnect races**: Idempotent cleanup; room ownership checks.  
- **Clock skew**: ±5 phút cho `issuedAt`.

---

## Appendix A — Verify Signature (Pseudo-code)
```ts
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export function verifySiws({ wallet, message, signature }: { wallet: string; message: string; signature: string }) {
  const pk = bs58.decode(wallet);
  const sig = Buffer.from(signature, 'base64');
  const msg = new TextEncoder().encode(message);

  const ok = nacl.sign.detached.verify(msg, sig, pk);
  if (!ok) return { ok: false, reason: 'BAD_SIGNATURE' };

  // Parse fields from message: Domain, Nonce, Issued At, Expiration Time
  // Validate:
  // 1) domain === process.env.DOMAIN
  // 2) nonce exists & not used & not expired
  // 3) now within [Issued At - 5m, Expiration Time]
  return { ok: true };
}
```

---

## Appendix B — Client `socketManager` (Sketch)
```ts
// socketManager.ts
import { io, Socket } from "socket.io-client";

class SocketManager {
  private socket?: Socket;

  create(token: string) {
    if (this.socket) return this.socket;
    this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      autoConnect: false,
      reconnection: true,
      transports: ["websocket"],
      auth: { token }
    });
    return this.socket;
  }

  setToken(token: string) {
    if (this.socket) this.socket.auth = { token };
  }

  connect() { this.socket?.connect(); }
  disconnect() { this.socket?.disconnect(); }

  on(event: string, cb: (...args:any[]) => void) { this.socket?.on(event, cb); }
  off(event: string, cb?: (...args:any[]) => void) { this.socket?.off(event, cb as any); }
  emit(event: string, payload?: any) { this.socket?.emit(event, payload); }

  get current() { return this.socket!; }
}

export const socketManager = new SocketManager();
```

**Usage**: Register listener ở `scene.create()`/`useEffect(mount)` và `off()` ở `scene.shutdown()`/`useEffect(unmount)`. Chỉ `disconnect()` khi logout.
