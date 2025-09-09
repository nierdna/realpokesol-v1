export interface Battle {
  id: string;
  player1Id: string;
  player2Id: string;
  currentTurn: 'player1' | 'player2';
  turnCount: number;
  state: 'waiting' | 'active' | 'ended';
  winnerId?: string;
  createdAt: Date;
  log: string[];
}

export interface BattleState {
  p1: {
    id: string;
    hp: number;
    maxHp: number;
    level: number;
  };
  p2: {
    id: string;
    hp: number;
    maxHp: number;
    level: number;
  };
  currentTurnOwnerId: string;
  turnCount: number;
}

export interface IBattleRepository {
  create(battle: Battle): Promise<void>;
  get(id: string): Promise<Battle | null>;
  update(id: string, patch: Partial<Battle>): Promise<void>;
  appendLog(id: string, line: string): Promise<void>;
  endBattle(id: string, winnerId: string): Promise<void>;
  delete(id: string): Promise<void>;
  findByPlayerId(playerId: string): Promise<Battle | null>;
  listActive(limit?: number): Promise<Battle[]>;
}
