export interface MatchCreatedEvent {
  type: 'MATCH_CREATED';
  match: {
    roomId: string;
    player1Id: string;
    player2Id: string;
    player1: {
      id: string;
      nickname: string;
      level: number;
    };
    player2: {
      id: string;
      nickname: string;
      level: number;
    };
  };
}

export interface MatchTimeoutEvent {
  type: 'MATCH_TIMEOUT';
  userId: string;
  reason: 'QUEUE_TIMEOUT';
}

export interface MatchQueueJoinedEvent {
  type: 'MATCH_QUEUE_JOINED';
  userId: string;
  position: number;
  queueLength: number;
}

export interface MatchQueueLeftEvent {
  type: 'MATCH_QUEUE_LEFT';
  userId: string;
}

// Event name constants
export const MATCH_EVENTS = {
  MATCH_CREATED: 'match.created',
  MATCH_TIMEOUT: 'match.timeout',
  MATCH_QUEUE_JOINED: 'match.queue.joined',
  MATCH_QUEUE_LEFT: 'match.queue.left',
} as const;
