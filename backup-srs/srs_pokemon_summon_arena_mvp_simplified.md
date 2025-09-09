# Software Requirements Specification (SRS) - MVP Simplified

**Project**: Pokémon Summon Arena — MVP Edition (Simplified 2D PvP)

**Frontend**: Next.js 15, Phaser 3, Socket.io client  
**Backend**: NestJS, Socket.io (WebSockets), In-Memory Storage  
**Development**: Docker Compose, Local Development

> **MVP Focus**: Core gameplay loop với simplified mechanics, no wallet/economy/complex stats

---

## 1. Goals & Scope

### 1.1 MVP Goals
- **Fast prototyping**: Core PvP battle system working in 2-3 weeks
- **Simple mechanics**: Random win/lose, level progression (+1 on win)
- **Real-time multiplayer**: Lobby movement + turn-based battles
- **Zero friction onboarding**: Join game instantly, no authentication required

### 1.2 In Scope (MVP)
- Auto-generated users on socket connection
- Lobby world with avatar movement (Phaser 3)
- Default creature cho user
- Simple matchmaking (random pairing)
- Turn-based battle with random outcomes
- Level progression: win = +1 level, lose = creature "faints" temporarily
- Real-time chat and emotes
- In-memory data persistence (no database)

### 1.3 Out of Scope (MVP)
- ❌ Wallet authentication (Solana/SIWS)
- ❌ SPL token economy and balance management
- ❌ Training mechanics and SPL costs
- ❌ Complex stat calculations and Natures
- ❌ Database persistence (PostgreSQL/Prisma)
- ❌ Revival system with costs
- ❌ MMR-based matchmaking
- ❌ Admin panel and analytics

---

## 2. System Overview & Architecture

### 2.1 Simplified Architecture
```
[Next.js + Phaser] --(WebSocket: Socket.io)--> [NestJS Gateway]
        |                                         |
        |                                         v
   (Local State)                            [In-Memory Services]
                                                  |
                                                  v
                                        [Map/Set Data Storage]
```

### 2.2 Core Services (NestJS)
- **UserService**: Auto-create users on connection, manage user state
- **LobbyService**: Avatar movement, chat, emotes, server-authoritative positioning  
- **MatchmakingService**: Simple queue with random pairing
- **BattleService**: Turn-based engine with random win/lose outcomes
- **CreatureService**: Load default creature data, assign same starter to all users

### 2.3 Data Flow
1. Client connects to Socket.io → Auto-create User with random nickname
2. User enters lobby → Receives world snapshot → Real-time movement updates
3. User clicks "Find Match" → Joins queue → Random pairing with another player
4. Battle starts → Turn-based UI → Random damage/outcome → Winner +1 level
5. Battle ends → Return to lobby → Repeat cycle

---

## 3. Functional Requirements

### 3.1 User Management (Simplified)
- **FR-U1**: Auto-generate user on socket connection with random nickname (`Player1234`)
- **FR-U2**: Assign same default starting creature to all users at level 1
- **FR-U3**: Store user state in memory with socketId mapping
- **FR-U4**: Clean up user data on disconnect

### 3.2 Lobby System (Phaser)
- **FR-L1**: Server-authoritative avatar movement with client prediction
- **FR-L2**: Real-time position updates via Socket.io (10-15 Hz)
- **FR-L3**: Simple chat system with message broadcasting
- **FR-L4**: Emote system (basic emotions: happy, sad, angry)
- **FR-L5**: Player list showing online users and their levels

### 3.3 Matchmaking (Random)
- **FR-M1**: Simple queue system using in-memory array
- **FR-M2**: Random pairing when 2+ players in queue
- **FR-M3**: Match timeout after 60 seconds (return to lobby)
- **FR-M4**: Create battle room with unique roomId

### 3.4 Battle System (Random Outcomes)
- **FR-B1**: Turn-based structure with alternating turns
- **FR-B2**: Random damage calculation: `damage = random(10, 60)`
- **FR-B3**: Random critical hit chance: 10% for 1.5x damage
- **FR-B4**: Battle ends when one creature reaches 0 HP
- **FR-B5**: Winner gets +1 level (cap at 100), loser creature "faints"
- **FR-B6**: Fainted creatures auto-revive after battle with 1 HP

### 3.5 Creature System (Basic)
- **FR-C1**: Load single default creature from hardcoded data
- **FR-C2**: Simple stats: HP (only stat that matters), Level (1-100)
- **FR-C3**: No natures, no training, no complex calculations
- **FR-C4**: Level progression only through PvP wins
- **FR-C5**: Max HP = `50 + (level * 5)` (simple formula)

### 3.6 Data Persistence (In-Memory)
- **FR-D1**: Use JavaScript Map/Set for all data storage
- **FR-D2**: User data: `users = new Map<socketId, UserData>()`
- **FR-D3**: Battle data: `battles = new Map<roomId, BattleState>()`
- **FR-D4**: No persistence between server restarts
- **FR-D5**: Graceful cleanup on user disconnect

---

## 4. Non-Functional Requirements (NFR)

- **NFR-1 Performance**: Lobby updates at 10-15 Hz, battle actions <100ms response
- **NFR-2 Scalability**: Single server instance, 50-100 concurrent users max
- **NFR-3 Simplicity**: Minimal code complexity, rapid development focused
- **NFR-4 Development**: Local development with hot reload, Docker optional
- **NFR-5 Reliability**: Basic error handling, graceful disconnection handling

---

## 5. Data Model (In-Memory)

### 5.1 User Data Structure
```typescript
interface User {
  id: string;                    // uuid
  socketId: string;              // socket.io client id
  nickname: string;              // Player1234
  position: { x: number, y: number };
  level: number;                 // current creature level
  creature: {
    name: string;
    hp: number;
    maxHp: number;
    level: number;
    isFainted: boolean;
  };
  isInBattle: boolean;
  createdAt: Date;
}
```

### 5.2 Battle Data Structure
```typescript
interface Battle {
  id: string;                    // room id
  player1: User;
  player2: User;
  currentTurn: 'player1' | 'player2';
  turnCount: number;
  state: 'waiting' | 'active' | 'ended';
  winner?: User;
  createdAt: Date;
}
```

### 5.3 Creature Base Data
```typescript
interface BaseCreature {
  id: string;
  name: string;
  type: string;                  // single type only
  baseHp: number;               // for max HP calculation
  description: string;
}
```

---

## 6. Simplified Mechanics & Formulas

### 6.1 HP Calculation
- **Max HP**: `50 + (level * 5)`
- **Current HP**: Reduced by battle damage, resets to max after revival

### 6.2 Battle Damage (Random)
- **Base Damage**: `random(10, 60)`
- **Critical Hit**: 10% chance for 1.5x damage
- **Final Damage**: `baseDamage * (isCrit ? 1.5 : 1.0)`

### 6.3 Level Progression
- **Win**: +1 level (max 100)
- **Lose**: No level change, creature faints temporarily
- **Revival**: Automatic after battle ends, HP = 1

### 6.4 Matchmaking
- **Queue**: Simple FIFO array
- **Pairing**: Random selection when 2+ players available
- **No MMR**: All players can be matched regardless of level

---

## 7. APIs & Events

### 7.1 Socket.io Events

**Connection & User**
- `connection` → Auto-create user, send initial state
- `disconnect` → Cleanup user data

**Lobby**
- `lobby.join` → Enter lobby, get world snapshot
- `lobby.move` (client→server): `{ direction: 'up'|'down'|'left'|'right' }`
- `lobby.position` (server→client): `{ userId, x, y }`
- `lobby.chat` (client→server): `{ message: string }`
- `lobby.emote` (client→server): `{ type: 'happy'|'sad'|'angry' }`
- `lobby.update` (server→client): `{ users: User[] }`

**Matchmaking**
- `match.join` (client→server): Join matchmaking queue
- `match.leave` (client→server): Leave queue
- `match.found` (server→client): `{ roomId, opponent }`
- `match.timeout` (server→client): Queue timeout, return to lobby

**Battle**
- `battle.start` (server→client): `{ roomId, battleState }`
- `battle.action` (client→server): `{ action: 'attack' }` (simplified)
- `battle.turn` (server→client): `{ damage, isCrit, newHp, log }`
- `battle.end` (server→client): `{ winner, newLevels }`

---

## 8. Frontend (Next.js + Phaser)

### 8.1 Pages/Routes (Simplified)
- `/` - Landing page with "Join Game" button
- `/game` - Full-screen Phaser canvas (single page app)

### 8.2 Phaser Scenes
- **LobbyScene**: 2D world, avatar movement, UI overlays
- **BattleScene**: Turn-based UI, health bars, battle log
- **LoadingScene**: Initial connection and data loading

### 8.3 State Management
- **Local State**: React useState for UI state
- **Socket State**: Direct Socket.io event handling
- **No Complex Store**: Keep it simple with direct props

### 8.4 UI Components
- **LobbyUI**: Chat, player list, match button
- **BattleUI**: HP bars, action button, turn indicator
- **UserInfo**: Current level, creature info

---

## 9. Backend (NestJS)

### 9.1 Module Structure
```
src/
├── modules/
│   ├── user/           # UserService
│   ├── lobby/          # LobbyService  
│   ├── matchmaking/    # MatchmakingService
│   ├── battle/         # BattleService
│   └── creature/       # CreatureService
├── gateway/
│   └── socket.gateway.ts
├── data/
│   └── creatures.ts    # default creature data
└── main.ts
```

### 9.2 Socket.io Gateway
- Single gateway handling all namespaces
- Room management for battles
- Event rate limiting (basic)

### 9.3 In-Memory Storage
```typescript
// Global storage
const users = new Map<string, User>();
const battles = new Map<string, Battle>();
const matchQueue: string[] = [];  // user IDs
const creature = defaultCreature;  // static data
```

---

## 10. Development & Deployment

### 10.1 Local Development
- **Backend**: `pnpm run start:dev` (NestJS hot reload)
- **Frontend**: `pnpm run dev` (Next.js hot reload)  
- **Optional**: Docker Compose setup

### 10.2 Environment Setup
- Node.js 18+
- pnpm package manager
- VSCode recommended with extensions

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

### 11.1 Single Default Creature (Hardcoded)
```typescript
const defaultCreature = {
  id: '1', 
  name: 'Flamewyrm', 
  type: 'Fire', 
  baseHp: 60, 
  description: 'A fiery dragon-like creature that all players start with'
};
```

---

## 12. Testing Strategy

### 12.1 Manual Testing
- Multiple browser tabs for multiplayer testing
- Socket.io admin UI for connection monitoring
- Console logs for debugging game state

### 12.2 Core Test Scenarios
1. **Connection Flow**: Socket connect → User created → Lobby entered
2. **Movement**: WASD movement → Position updates → Other players see movement
3. **Chat**: Send message → All users receive message
4. **Matchmaking**: Join queue → Get matched → Battle starts
5. **Battle**: Take turns → Random damage → Winner gets +1 level
6. **Disconnect**: User leaves → Cleanup → Other users updated

---

## 13. Success Criteria

### 13.1 MVP Acceptance Criteria
- ✅ Users can join instantly without authentication
- ✅ Lobby supports 10+ concurrent users moving smoothly
- ✅ Matchmaking pairs players within 30 seconds
- ✅ Battles work end-to-end with random outcomes
- ✅ Winners gain levels, losers' creatures faint temporarily
- ✅ Chat and emotes work in real-time
- ✅ Server handles disconnections gracefully

### 13.2 Performance Targets
- **Lobby**: 10-15 FPS updates, <100ms input lag
- **Battle**: <200ms turn response time
- **Capacity**: 50+ concurrent users (local testing)
- **Stability**: 30+ minutes continuous gameplay without crashes

---

## 14. Future Enhancements (Post-MVP)

After MVP is proven, consider adding back:
- Solana wallet authentication (SIWS)
- SPL token economy and training mechanics
- Database persistence with Prisma
- Complex stat calculations and Natures
- MMR-based matchmaking
- Admin panel and analytics
- Mobile responsiveness
- Battle animations and sound effects

---

## 15. Risk Mitigation

### 15.1 Technical Risks
- **Socket.io scaling**: Start with single server, add Redis adapter later
- **Memory leaks**: Implement proper cleanup on disconnect
- **Game balance**: Random outcomes may feel unsatisfying → add pseudo-randomness

### 15.2 Development Risks  
- **Scope creep**: Stick strictly to MVP features
- **Over-engineering**: Use simplest solutions that work
- **Time management**: 2-3 week timeline is aggressive but achievable

---

**Total Estimated Development Time: 2-3 weeks**
**Target Launch: Local development environment with 10+ concurrent users**

