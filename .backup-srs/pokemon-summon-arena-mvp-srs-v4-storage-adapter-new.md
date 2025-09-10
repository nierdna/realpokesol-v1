# Software Requirements Specification (SRS) — Pokémon Summon Arena
**Version**: v4 — MVP (Auth-Enabled, Event-Driven, Storage Adapter)

**Project**: Pokémon Summon Arena — MVP Edition (Simplified 2D PvP)  
**Frontend**: Next.js 15, Phaser 3, Socket.io client, @solana/wallet-adapter  
**Backend**: NestJS, Socket.io (WebSockets), In-Memory Storage (MVP), **Storage Adapter** (Memory ↔ Postgres)  
**Dev**: pnpm, Docker Compose (optional), Local Dev (hot reload)

> **MVP Focus**: Core gameplay loop với **SIWS bắt buộc** (Sign-In with Solana), battle đơn giản, lobby real-time.  
> **Storage**: MVP dùng **Memory Adapter**; thiết kế sẵn **Adapter** để **switch sang Postgres** ở Final Product **không đổi code business**.

---

## 1. Goals & Scope

### 1.1 MVP Goals
- **Fast prototyping**: Core PvP chạy trong 2–3 tuần.
- **Simple mechanics**: Turn-based; random damage & crit; **win = +1 level**.
- **Real-time multiplayer**: Lobby movement (server-authoritative) + turn-based battles.
- **Authentication**: **Bắt buộc** SIWS → verify → issue access token → Socket chỉ connect sau SIWS.
- **Storage Adapter**: Business code chỉ gọi vào **interfaces**; MVP chạy Memory; Final switch Postgres **qua ENV**.

### 1.2 In Scope (MVP)
- **User tạo tại `/auth/siws`**; socket **chỉ** connect sau SIWS; **không** guest/auto-generated.
- Lobby + movement + chat + emotes.
- Matchmaking fairness: ưu tiên 2 người chờ lâu nhất (tie → random trong nhóm đầu); timeout 60s.
- Battle turn-based; winner +1 level; loser faint → revive HP=1.
- **In-memory data** (Map/Set) **qua Adapter Interface**.
- **Pluggable Storage Module** (NestJS DI): Memory (MVP), Postgres (stub/ready).

### 1.3 Out of Scope (MVP)
- ❌ SPL economy, balances, training costs.  
- ❌ Complex stats (Natures/IV/EV).  
- ❌ Admin/analytics.  
- ❌ MMR.  
- ❌ Mobile polish, SFX nâng cao.

---

## 2. System Overview & Architecture

### 2.1 Architecture
```
[Next.js + Phaser + Wallet Adapter] -- REST (/auth/*) --> [NestJS AuthController/AuthService]
         |                                                        |
         |                                                        v
         |<---- Socket.io (JWT Handshake) ----------------> [NestJS Socket Gateway]
                                                             |             |
                                                             v             v
                                                      [Domain Services]  [Storage Adapter]
                                                     (User/Lobby/Match/   (Interfaces)
                                                      Battle/Creature)        |
                                                                               v
                                                                [Memory Adapter]  ← MVP
                                                                [Postgres Adapter] ← Final
```

### 2.2 Core Backend Services (không đổi)
- **AuthService**: Cấp nonce; verify chữ ký Ed25519; issue JWT; quản lý nonces/sessions (in-memory).
- **UserService**: Tạo/tìm user theo wallet; quản lý online/offline; attach socket.
- **LobbyService**: Authoritative movement; chat; emotes; broadcast presence/positions.
- **MatchmakingService**: Hàng đợi in-memory; ưu tiên 2 người chờ lâu nhất (tie → random trong nhóm đầu); timeout.
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
- **FR-A6 (SIWS canonical & policy)**: *Message canonical order* (thứ tự field cố định, xuống dòng `\n` chuẩn, UTF-8); **clock skew ±5 phút** khi so khớp `Issued At/Expiration`; bắt buộc **fields**: `Domain`, `Nonce`, `Issued At`, `Expiration Time`.
- **FR-A7 (JWT claims & lifecycle)**: JWT bổ sung claims: `aud` (socket domain), `ver` (phiên bản schema), `jti` (để revoke). Access token 60m; **không dùng refresh token** trong MVP (401 → yêu cầu SIWS lại).
- **FR-A8 (CORS & Origin)**: REST bật **CORS allowlist**; Socket handshake kiểm tra **Origin** khớp allowlist.
- **FR-A9 (Rate limit REST)**: `/auth/*` bị **rate-limit 5 req/phút** theo IP/wallet; vi phạm trả 429.
- **FR-A10 (JWT algorithm & claims)**: MVP dùng HS256; production khuyến nghị RS256/EdDSA kèm kid để xoay khoá. Bổ sung claims iss (issuer = domain BE) và sub (subject = userId) bên cạnh aud|ver|jti.

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

**Moderation (MVP)**: Không áp dụng lọc/log chat ở MVP. Chỉ giữ hook tắt (stub) để có thể bật sau này mà không đổi giao thức.

### 3.4 Matchmaking (Fairness FIFO)
- **FR-M1**: FIFO queue (userIds); `match.join`/`match.leave` idempotent.
- **FR-M2**: Khi ≥2 user → chọn 2 người chờ lâu nhất (dựa trên joinAt); nếu có nhiều người cùng mốc thời gian, bốc ngẫu nhiên trong nhóm đầu hàng đợi → tạo roomId → match.found.
- **FR-M3**: Timeout 60s → `match.timeout` → trở lại lobby.
- **FR-M4**: Xử lý disconnect trong queue/battle an toàn.

**Fairness policy (bắt buộc)**: Hàng đợi FIFO theo joinAt; khi có ≥2 người chơi, chọn 2 người chờ lâu nhất để ghép. Nếu có nhiều người cùng mốc thời gian, bốc ngẫu nhiên trong nhóm đầu hàng đợi.

**match.join lưu joinAt**: number (epoch ms) trong server để phục vụ tiêu chí ưu tiên.

### 3.5 Battle System (Random Outcomes)
- **FR-B1**: Alternating turns; track `currentTurn` & `turnCount`.
- **FR-B2**: Damage mỗi đòn: `randomInt(10, 60)`.
- **FR-B3**: Crit 10% → multiplier **1.5×**.
- **FR-B4**: HP min 0; KO khi 0.
- **FR-B5**: Winner **+1 level** (cap 100).
- **FR-B6**: Loser **faint**; **auto-revive với 1 HP** sau khi battle kết thúc.
- **FR-B7**: Emit `battle.end` → FE quay về lobby → đồng bộ lại snapshot/level.
- **FR-B8 (`battle.action` idempotency)**: `battle.action` schema thêm trường `requestId: string (UUID)` để **idempotency**; server bỏ qua duplicated `requestId` trong cùng 1 battle.
- **FR-B9 (`battle.timeout`)**: nếu không có hành động trong **60s** → xử thua (server phát battle.end{ reason:'AFK_TIMEOUT' })
- **FR-B10 (Resume on reconnect)**: nếu user reconnect **trước `battle.end`**, server gửi lại `battle.start` với **state mới nhất** để **tiếp tục trận** thay vì quay lobby.

**(Sự kiện) battle.timeout (s→c) (tùy chọn UI)**: thông báo client trước khi battle.end vì AFK.

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
- **Pairing**: Chọn 2 người chờ lâu nhất; nếu nhiều người cùng joinAt, random trong nhóm đầu.
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

#### 7.2.1 Operational Guards
- **Per-event rate limit**: `lobby.move ≤ 20/s`, `lobby.chat ≤ 2/s`, `battle.action ≤ 2/s` mỗi user.
- **Single-session policy**: mỗi user chỉ giữ **1 socket**; khi socket mới vào → **kick** socket cũ.
- **Keepalive**: `pingInterval = 20000ms`, `pingTimeout = 20000ms`.
- **Pre-upgrade auth**: verify JWT ngay trong `allowRequest` trước khi nâng cấp WS.

**Single-session policy (bắt buộc)**: Mỗi userId chỉ có 01 socket đang hoạt động. Khi socket mới của cùng userId kết nối, server gửi REPLACED rồi disconnect socket cũ (close code 4001), cập nhật lại mapping userId ↔ socketId.

**Active session map**: lưu activeSessions: Map<userId, socketId>; mọi broadcast/listOnline dựa trên map này để tránh đếm trùng.

- **ACK timeout**: battle.action dùng ack với timeout = 3000ms; quá hạn → trả error: ACTION_TIMEOUT, không xếp hàng bổ sung.
- **Backpressure limit**: maxPendingEventsPerUser = 50; vượt ngưỡng → disconnect (close code 4002, reason: BACKPRESSURE).

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
- **Fairness**: ghép trận ưu tiên người chờ lâu nhất; nếu đồng thời, random trong nhóm đầu.

**Battle**
- `battle.start` (s→c): `{ roomId, battleState }`
- `battleState`: `{ p1:{ id,hp,maxHp,level }, p2:{ id,hp,maxHp,level }, currentTurnOwnerId, turnCount }` (MVP).
- `battle.action` (c→s): `{ action: 'attack', requestId: string }` (MVP) — thêm `requestId: string (UUID)` để **idempotency**; server bỏ qua duplicated `requestId` trong cùng 1 battle.
- `battle.turn` (s→c) payload mở rộng: `{ damage, isCrit, targetHp, log, currentTurnOwnerId, nextTurnOwnerId }`.
- `battle.end` (s→c): `{ winnerId, newLevels }`
- `newLevels`: `{ [userId:string]: number }`
- **`battle.timeout`**: Nếu không có hành động trong 60s ở lượt người chơi → xử thua (server phát battle.end{ reason:'AFK_TIMEOUT' }).
- **Resume on reconnect**: nếu user reconnect **trước `battle.end`**, server gửi lại `battle.start` với **state mới nhất** để **tiếp tục trận** thay vì quay lobby.

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
   - BE: đủ ≥2 user → chọn 2 người chờ lâu nhất (tie → random trong nhóm đầu) → tạo roomId → match.found.
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

**Resume (bắt buộc)**: Nếu user reconnect trước battle.end, server đưa user vào lại room và gửi battle.start kèm state mới nhất (bao gồm lượt hiện tại, HP, log, currentTurnOwnerId, nextTurnOwnerId) để tiếp tục trận, không quay lobby.

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
  - `battle.turn`  → `{ damage, isCrit, targetHp, log, currentTurnOwnerId, nextTurnOwnerId }`  
  - `battle.end`   → `{ winnerId, newLevels }`
- **Emit**:  
  - Lượt người chơi: `battle.action { action:'attack', requestId }`  
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

## 9. Backend (NestJS) — **Storage Adapter Design**

### 9.1 Storage Module & DI
- Tạo `StorageModule` xuất các **tokens** & providers cho repositories và unit-of-work (UoW).
- **ENV switch**: `STORAGE_DRIVER=memory|postgres`.
- Domain services **chỉ** inject **interfaces** (tokens), không biết implementation.

```ts
// tokens.ts
export const TOKENS = {
  UserRepo:   Symbol('UserRepo'),
  BattleRepo: Symbol('BattleRepo'),
  MatchQueue: Symbol('MatchQueue'),   // (optional: Postgres/Redis in future)
  UnitOfWork: Symbol('UnitOfWork'),
};
```

```ts
// storage.module.ts (simplified)
@Module({
  providers: [
    {
      provide: TOKENS.UserRepo,
      useFactory: (cfg: StorageConfig, prisma?: PrismaService) => 
        cfg.driver === 'postgres' ? new PgUserRepo(prisma!) : new MemoryUserRepo(),
      inject: [StorageConfig, PrismaService],
    },
    {
      provide: TOKENS.BattleRepo,
      useFactory: (cfg: StorageConfig, prisma?: PrismaService) => 
        cfg.driver === 'postgres' ? new PgBattleRepo(prisma!) : new MemoryBattleRepo(),
      inject: [StorageConfig, PrismaService],
    },
    {
      provide: TOKENS.UnitOfWork,
      useFactory: (cfg: StorageConfig, prisma?: PrismaService) => 
        cfg.driver === 'postgres' ? new PgUnitOfWork(prisma!) : new NoopUnitOfWork(),
      inject: [StorageConfig, PrismaService],
    },
    // MatchQueue: memory for MVP; future: Pg/Redis
  ],
  exports: [TOKENS.UserRepo, TOKENS.BattleRepo, TOKENS.UnitOfWork, TOKENS.MatchQueue],
  imports: [ConfigModule, PrismaModule], // PrismaModule optional when postgres
})
export class StorageModule {}
```

> **Note**: Có thể dùng Prisma/Drizzle/TypeORM. Ví dụ trên minh hoạ Prisma.

### 9.2 Repository Interfaces (Ports)
```ts
// ports/user-repo.ts
export interface IUserRepository {
  findById(userId: string): Promise<User | null>;
  findByWallet(wallet: string): Promise<User | null>;
  create(user: User): Promise<void>;
  update(user: Partial<User> & { id: string }): Promise<void>;
  setSocket(userId: string, socketId: string | null): Promise<void>;
  listOnline(limit?: number): Promise<Array<Pick<User,'id'|'nickname'|'creature'|'position'>>>;
  upsertCreature(userId: string, creature: User['creature']): Promise<void>;
}

// ports/battle-repo.ts
export interface IBattleRepository {
  create(battle: Battle): Promise<void>;
  get(id: string): Promise<Battle | null>;
  update(id: string, patch: Partial<Battle>): Promise<void>;
  appendLog(id: string, line: string): Promise<void>;
  endBattle(id: string, winnerId: string): Promise<void>;
}

// ports/unit-of-work.ts
export interface IUnitOfWork {
  withTransaction<T>(fn: (tx: { userRepo: IUserRepository; battleRepo: IBattleRepository; }) => Promise<T>): Promise<T>;
}
```

### 9.3 Memory Adapter (MVP)
```ts
export class MemoryUserRepo implements IUserRepository {
  private users = new Map<string, User>();
  private walletIdx = new Map<string, string>(); // wallet -> userId
  async findById(id: string) { return this.users.get(id) ?? null; }
  async findByWallet(w: string) { const id = this.walletIdx.get(w); return id ? this.findById(id) : null; }
  async create(u: User) { this.users.set(u.id, u); this.walletIdx.set(u.walletAddress, u.id); }
  async update(p: Partial<User> & { id: string }) { const cur = this.users.get(p.id); if (!cur) return; this.users.set(p.id, { ...cur, ...p }); }
  async setSocket(id: string, sid: string|null) { const cur = this.users.get(id); if (!cur) return; cur.socketId = sid ?? undefined; }
  async listOnline(limit=100) {
    const rows: any[] = [];
    for (const u of this.users.values()) if (u.socketId) rows.push({ id: u.id, nickname: u.nickname, creature: u.creature, position: u.position });
    return rows.slice(0, limit);
  }
  async upsertCreature(uid: string, creature: User['creature']) {
    const cur = this.users.get(uid); if (!cur) return; cur.creature = creature;
  }
}

export class MemoryBattleRepo implements IBattleRepository {
  private battles = new Map<string, Battle>();
  async create(b: Battle) { this.battles.set(b.id, b); }
  async get(id: string) { return this.battles.get(id) ?? null; }
  async update(id: string, patch: Partial<Battle>) {
    const cur = this.battles.get(id); if (!cur) return; this.battles.set(id, { ...cur, ...patch });
  }
  async appendLog(id: string, line: string) {
    const cur = this.battles.get(id); if (!cur) return; cur.log.push(line);
  }
  async endBattle(id: string, winnerId: string) { await this.update(id, { state: 'ended', winnerId }); }
}

export class NoopUnitOfWork implements IUnitOfWork {
  async withTransaction<T>(fn: (tx:any)=>Promise<T>) { return fn({}); }
}
```

### 9.4 Postgres Adapter (Final-Ready)

> Có thể dùng **Prisma** (đề xuất) hoặc Drizzle/TypeORM. Dưới đây là **DDL tối thiểu** + mapping.

#### 9.4.1 DDL (SQL – tối thiểu)
```sql
-- users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  socket_id TEXT NULL,
  pos_x INT NOT NULL DEFAULT 0,
  pos_y INT NOT NULL DEFAULT 0,
  is_in_battle BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NULL
);

-- user_creatures (1-1 MVP; mở rộng 1-N nếu cần)
CREATE TABLE user_creatures (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hp INT NOT NULL,
  max_hp INT NOT NULL,
  level INT NOT NULL,
  is_fainted BOOLEAN NOT NULL DEFAULT FALSE
);

-- battles
CREATE TABLE battles (
  id UUID PRIMARY KEY,
  player1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_turn TEXT NOT NULL CHECK (current_turn IN ('player1','player2')),
  turn_count INT NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('waiting','active','ended')),
  winner_id UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- battle_logs (append-only)
CREATE TABLE battle_logs (
  id BIGSERIAL PRIMARY KEY,
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  line TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX battle_logs_battle_seq_idx ON battle_logs (battle_id, seq);
```

#### 9.4.4 Indexes & Constraints

- **users**:
  - UNIQUE(`wallet_address`); **partial index** `WHERE socket_id IS NOT NULL` để list online nhanh.
  - Index `(is_in_battle)`, `(created_at)`.
- **battles**: index `(player1_id)`, `(player2_id)`, và `(state, created_at)` để truy vấn trận active gần nhất.
- **battle\_logs**: giữ UNIQUE(`battle_id`,`seq`) + index(`battle_id`).
- **CHECK constraints**: `level BETWEEN 1 AND 100`, `hp >= 0`.
- **Gán seq an toàn**: thiết lập seq bằng câu lệnh SELECT COALESCE(MAX(seq),0)+1 FROM battle_logs WHERE battle_id = $1 FOR UPDATE trong transaction để tránh race condition khi ghi log song song.
  *(Giữ nguyên thiết kế Adapter DI/UoW; không đổi các interface.)*

#### 9.4.2 Prisma Schema (gợi ý rút gọn)
```prisma
model User {
  id           String   @id @default(uuid())
  walletAddress String  @unique
  nickname     String
  socketId     String?
  posX         Int      @default(0)
  posY         Int      @default(0)
  isInBattle   Boolean  @default(false)
  createdAt    DateTime @default(now())
  lastLoginAt  DateTime?

  creature     UserCreature?
}

model UserCreature {
  userId     String  @id
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  name       String
  hp         Int
  maxHp      Int
  level      Int
  isFainted  Boolean @default(false)
}

model Battle {
  id          String   @id @default(uuid())
  player1Id   String
  player2Id   String
  currentTurn String
  turnCount   Int      @default(0)
  state       String
  winnerId    String?
  createdAt   DateTime @default(now())

  logs        BattleLog[]
}

model BattleLog {
  id        BigInt   @id @default(autoincrement())
  battleId  String
  seq       Int
  line      String
  createdAt DateTime @default(now())

  battle    Battle   @relation(fields: [battleId], references: [id], onDelete: Cascade)

  @@unique([battleId, seq])
}
```

#### 9.4.3 Postgres Implementations (phác thảo)
```ts
export class PgUnitOfWork implements IUnitOfWork {
  constructor(private prisma: PrismaService) {}
  async withTransaction<T>(fn: (tx:{ userRepo:IUserRepository; battleRepo:IBattleRepository }) => Promise<T>) {
    return this.prisma.$transaction(async (trx) => {
      const userRepo = new PgUserRepo(trx);
      const battleRepo = new PgBattleRepo(trx);
      return fn({ userRepo, battleRepo });
    });
  }
}

export class PgUserRepo implements IUserRepository {
  constructor(private db: PrismaClient) {}
  async findById(id: string) { /* db.user.findUnique */ }
  async findByWallet(w: string) { /* db.user.findUnique({ where:{ walletAddress:w } }) */ }
  async create(u: User) { /* db.user.create + db.userCreature.create */ }
  async update(p: Partial<User> & { id: string }) { /* db.user.update */ }
  async setSocket(id: string, sid: string|null) { /* update socketId */ }
  async listOnline(limit=100) { /* where socketId != null */ }
  async upsertCreature(uid: string, c: User['creature']) { /* upsert user_creatures */ }
}

export class PgBattleRepo implements IBattleRepository {
  constructor(private db: PrismaClient) {}
  async create(b: Battle) { /* db.battle.create */ }
  async get(id: string) { /* db.battle.findUnique({ include:{ logs:true } }) */ }
  async update(id: string, patch: Partial<Battle>) { /* db.battle.update */ }
  async appendLog(id: string, line: string) {
    const count = await this.db.battleLog.count({ where:{ battleId:id } });
    await this.db.battleLog.create({ data:{ battleId:id, seq: count+1, line } });
  }
  async endBattle(id: string, winnerId: string) { /* update state & winnerId */ }
}
```

### 9.5 Transaction Boundaries (UoW)
- **Battle turn**: cập nhật HP/turnCount/log **trong 1 transaction** (Postgres) để đảm bảo tính nhất quán.
- **Match found**: tạo record `battle` + cập nhật `isInBattle` 2 users trong 1 transaction.
- **End battle**: set `state='ended'`, `winnerId`, cập nhật level winner; reset loser faint→HP=1 (tuỳ logic) **trong 1 transaction**.

### 9.6 Switching Strategy
- ENV: `STORAGE_DRIVER=memory` (MVP) hoặc `postgres` (Final).  
- NestJS DI map tokens → adapter tương ứng qua `StorageModule`.  
- **Không đổi code** ở User/Lobby/Match/Battle services (chỉ gọi interface).

### 9.7 Migration & Seed (Final)
- Migrations via Prisma/Drizzle.  
- Seed: tạo default creature config; tạo user demo (tuỳ).  
- Data backfill từ memory → không áp dụng (MVP ephemeral).

---

## 10. Development & Deployment

### 10.1 Local Commands
- **Backend**: `pnpm run start:dev`  
- **Frontend**: `pnpm run dev`  
- **Docker (optional)**: `docker compose up`

### 10.2 Environment
```
NODE_ENV=development
DOMAIN=pokemon-arena.local
JWT_SECRET=supersecret
JWT_EXPIRES_IN=3600s
NONCE_TTL_SECONDS=300
SOCKET_URL=ws://localhost:3001
API_URL=http://localhost:3001

# Storage
STORAGE_DRIVER=memory            # memory | postgres
DATABASE_URL=postgresql://user:pass@localhost:5432/pokemon_arena
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

### 10.4 Observability

- **Metrics tối thiểu**:
  - `online_users`, `queue_length`, `time_to_match_ms`, `battle_duration_ms`, `turn_latency_ms`,
  - `ws_401_count`, `auth_signature_fail_count`, `rate_limit_hits`,
  - `socket_active_connections` — số kết nối WS đang hoạt động,
  - `event_drop_count` — số event bị drop do rate-limit/backpressure.
- **Log fields (structured JSON)**: `ts`, `level`, `userId`, `wallet`, `socketId`, `event`, `reqId`, `roomId`, `latencyMs`, `outcome` (`ok|error|timeout`), `errorCode` (nếu có).

---

## 11. Testing Strategy (bổ sung adapter)

### 11.1 Contract Tests (shared cho mọi adapter)
- `UserRepo`: create/findById/findByWallet/update/setSocket/listOnline/upsertCreature.  
- `BattleRepo`: create/get/update/appendLog/endBattle.  
- `UnitOfWork`: ensure atomicity (simulate concurrent turns).

### 11.2 Test Matrix
- **Memory**: chạy toàn bộ contract tests (CI default).  
- **Postgres**: chạy cùng test suite trên DB (CI job optional).

**Single-session**: mở 2 tab cùng wallet → tab 1 nhận REPLACED, biến mất khỏi listOnline.

**AFK loss**: đứng yên >60s khi tới lượt → nhận battle.end với reason:'AFK_TIMEOUT'.

**Resume**: ngắt mạng 5s khi đang battle → reconnect → nhận battle.start (state mới nhất) và tiếp tục.

**Queue fairness**: 3 user join lần lượt A, B, C → ghép A-B trước; C chờ tới người tiếp theo.

---

## 12. Acceptance Criteria (bổ sung storage)
- ✅ `STORAGE_DRIVER=memory` chạy e2e (MVP).  
- ✅ Đổi `STORAGE_DRIVER=postgres` (khi DB sẵn) **khởi động server OK** (adapter wired).  
- ✅ Contract tests pass trên cả 2 driver.  
- ✅ Battle turn và match-found là **transactional** trên Postgres.

### 12.1 Gameplay Acceptance
✅ Single-session: user mở tab mới → tab cũ nhận REPLACED và bị ngắt (4001).

✅ AFK: không thao tác 60s trong lượt → xử thua; server phát battle.end{ reason:'AFK_TIMEOUT' }.

✅ Resume: rớt mạng khi đang battle → reconnect → tiếp tục trận với state đồng bộ, không quay lobby.

✅ Fairness: ghép trận ưu tiên người chờ lâu nhất; nếu đồng thời, random trong nhóm đầu.

---

## 13. Risk Mitigation (storage)
- **Adapter drift**: Contract tests bắt buộc như “spec sống”.  
- **Deadlock** (PG): thứ tự update stable; tránh giữ khoá lâu.  
- **Hot paths**: đọc snapshot lobby có thể cache; write-through khi cần.  
- **Scale**: Battle logs append-only → index `(battle_id, seq)`; cân nhắc partition nếu tăng trưởng.

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

  // Parse fields: Domain, Nonce, Issued At, Expiration Time
  // Validate domain, nonce (exists/unused/not expired), time window.
  return { ok: true };
}
```

## Appendix B — Client `socketManager` (Sketch)
```ts
import { io, Socket } from "socket.io-client";
class SocketManager {
  private socket?: Socket;
  create(token: string) {
    if (this.socket) return this.socket;
    this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      autoConnect: false, reconnection: true, transports: ["websocket"], auth: { token }
    });
    return this.socket;
  }
  setToken(token: string) { if (this.socket) this.socket.auth = { token }; }
  connect() { this.socket?.connect(); }
  disconnect() { this.socket?.disconnect(); }
  on(ev: string, cb: (...a:any[])=>void) { this.socket?.on(ev, cb); }
  off(ev: string, cb?: (...a:any[])=>void) { this.socket?.off(ev, cb as any); }
  emit(ev: string, data?: any) { this.socket?.emit(ev, data); }
  get current() { return this.socket!; }
}
export const socketManager = new SocketManager();
```

## Appendix C — Storage Adapter Interfaces (Full Declarations)
```ts
export interface IUserRepository {
  findById(userId: string): Promise<User | null>;
  findByWallet(wallet: string): Promise<User | null>;
  create(user: User): Promise<void>;
  update(user: Partial<User> & { id: string }): Promise<void>;
  setSocket(userId: string, socketId: string | null): Promise<void>;
  listOnline(limit?: number): Promise<Array<Pick<User,'id'|'nickname'|'creature'|'position'>>>;
  upsertCreature(userId: string, creature: User['creature']): Promise<void>;
}

export interface IBattleRepository {
  create(battle: Battle): Promise<void>;
  get(id: string): Promise<Battle | null>;
  update(id: string, patch: Partial<Battle>): Promise<void>;
  appendLog(id: string, line: string): Promise<void>;
  endBattle(id: string, winnerId: string): Promise<void>;
}

export interface IUnitOfWork {
  withTransaction<T>(fn: (tx: { userRepo: IUserRepository; battleRepo: IBattleRepository; }) => Promise<T>): Promise<T>;
}
```
