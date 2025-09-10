// Socket event type definitions

export interface LobbyUser {
  id: string;
  nickname: string;
  level: number;
  x: number;
  y: number;
}

export interface ChatMessage {
  userId: string;
  nickname: string;
  message: string;
  timestamp: string;
}

export interface EmoteEvent {
  userId: string;
  nickname: string;
  type: "happy" | "sad" | "angry";
  timestamp: string;
}

export interface BattleState {
  p1: { id: string; hp: number; maxHp: number; level: number };
  p2: { id: string; hp: number; maxHp: number; level: number };
  currentTurnOwnerId: string;
  turnCount: number;
}

export interface SocketEvents {
  // Socket.io built-in events
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: unknown) => void;

  // Custom connection events
  connected: (data: {
    message: string;
    user: { id: string; nickname: string; level: number };
    timestamp: string;
  }) => void;
  error: (data: { code: string; message: string }) => void;
  replaced: (data: { message: string }) => void;

  // Lobby
  "lobby.snapshot": (data: {
    users: LobbyUser[];
    userPosition: { x: number; y: number };
  }) => void;
  "lobby.update": (data: { users: LobbyUser[] }) => void;
  "lobby.position": (data: { userId: string; x: number; y: number }) => void;
  "lobby.chat": (data: ChatMessage) => void;
  "lobby.emote": (data: EmoteEvent) => void;

  // Matchmaking
  "match.found": (data: {
    roomId: string;
    opponent: { id: string; nickname: string; level: number };
  }) => void;
  "match.timeout": () => void;
  "match.queued": (data: { position: number; estimatedWait: number }) => void;
  "match.left": (data: { timestamp: string }) => void;

  // Battle
  "battle.start": (data: { roomId: string; battleState: BattleState }) => void;
  "battle.turn": (data: {
    damage: number;
    isCrit: boolean;
    targetHp: number;
    log: string;
    currentTurnOwnerId: string;
    nextTurnOwnerId: string;
    battleEnded: boolean;
    winnerId?: string;
  }) => void;
  "battle.end": (data: {
    winnerId: string;
    newLevels: { [userId: string]: number };
    reason?: string;
  }) => void;
  "battle.timeout": (data: {
    reason: string;
    readyCount: number;
    expectedCount: number;
    timestamp: string;
  }) => void;

  // Debug
  "debug.stats": (data: unknown) => void;
}
