export interface MatchQueueEntry {
  userId: string;
  joinedAt: number;
}

export interface IMatchQueue {
  join(userId: string): Promise<void>;
  leave(userId: string): Promise<void>;
  getNext(count: number): Promise<MatchQueueEntry[]>;
  remove(userIds: string[]): Promise<void>;
  getPosition(userId: string): Promise<number | null>;
  getStats(): Promise<{
    length: number;
    averageWaitTime: number;
  }>;
  clear(): Promise<void>;
}
