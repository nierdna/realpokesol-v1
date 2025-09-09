import { Injectable, Logger } from '@nestjs/common';
import { IMatchQueue, MatchQueueEntry } from '../../ports/match-queue.interface';

@Injectable()
export class MemoryMatchQueue implements IMatchQueue {
  private readonly logger = new Logger(MemoryMatchQueue.name);
  private queue: MatchQueueEntry[] = [];

  async join(userId: string): Promise<void> {
    // Remove if already in queue
    await this.leave(userId);

    const entry: MatchQueueEntry = {
      userId,
      joinedAt: Date.now(),
    };

    this.queue.push(entry);
    this.logger.log(`User joined queue: ${userId}, position: ${this.queue.length}`);
  }

  async leave(userId: string): Promise<void> {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(entry => entry.userId !== userId);
    
    if (this.queue.length < initialLength) {
      this.logger.log(`User left queue: ${userId}`);
    }
  }

  async getNext(count: number): Promise<MatchQueueEntry[]> {
    if (this.queue.length < count) {
      return [];
    }

    // Sort by joinedAt (FIFO with fairness)
    this.queue.sort((a, b) => a.joinedAt - b.joinedAt);

    // Get the earliest entries
    const earliest = this.queue.slice(0, count);
    
    // If multiple people joined at the same time, randomize among them
    const earliestTime = earliest[0]?.joinedAt;
    if (earliestTime) {
      const sameTimeEntries = this.queue.filter(e => e.joinedAt === earliestTime);
      if (sameTimeEntries.length > count) {
        // Shuffle and take only what we need
        for (let i = sameTimeEntries.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [sameTimeEntries[i], sameTimeEntries[j]] = [sameTimeEntries[j], sameTimeEntries[i]];
        }
        return sameTimeEntries.slice(0, count);
      }
    }

    return earliest;
  }

  async remove(userIds: string[]): Promise<void> {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(entry => !userIds.includes(entry.userId));
    
    const removed = initialLength - this.queue.length;
    if (removed > 0) {
      this.logger.log(`Removed ${removed} users from queue: ${userIds.join(', ')}`);
    }
  }

  async getPosition(userId: string): Promise<number | null> {
    // Sort by joinedAt first
    this.queue.sort((a, b) => a.joinedAt - b.joinedAt);
    
    const index = this.queue.findIndex(entry => entry.userId === userId);
    return index >= 0 ? index + 1 : null;
  }

  async getStats(): Promise<{ length: number; averageWaitTime: number }> {
    const now = Date.now();
    const totalWaitTime = this.queue.reduce((sum, entry) => sum + (now - entry.joinedAt), 0);
    
    return {
      length: this.queue.length,
      averageWaitTime: this.queue.length > 0 ? totalWaitTime / this.queue.length : 0,
    };
  }

  async clear(): Promise<void> {
    const count = this.queue.length;
    this.queue = [];
    this.logger.log(`Queue cleared: ${count} entries removed`);
  }

  // Debug method
  getQueueSnapshot(): MatchQueueEntry[] {
    return [...this.queue].sort((a, b) => a.joinedAt - b.joinedAt);
  }
}
