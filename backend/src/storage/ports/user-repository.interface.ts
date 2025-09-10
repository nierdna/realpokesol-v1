export interface User {
  id: string;
  socketId?: string;
  nickname: string;
  walletAddress: string;
  position: { x: number; y: number };
  creature: {
    name: string;
    hp: number;
    maxHp: number;
    level: number;
    isFainted: boolean;
  };
  isInBattle: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface UserSummary {
  id: string;
  nickname: string;
  creature: User['creature'];
  position: User['position'];
}

export interface IUserRepository {
  findById(userId: string): Promise<User | null>;
  findByWallet(wallet: string): Promise<User | null>;
  create(user: User): Promise<void>;
  update(user: Partial<User> & { id: string }): Promise<void>;
  setSocket(userId: string, socketId: string | null): Promise<void>;
  listOnline(limit?: number): Promise<UserSummary[]>;
  upsertCreature(userId: string, creature: User['creature']): Promise<void>;
  setInBattle(userId: string, inBattle: boolean): Promise<void>;
  updatePosition(
    userId: string,
    position: { x: number; y: number },
  ): Promise<void>;
}
