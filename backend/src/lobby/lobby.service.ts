import { Injectable, Logger } from '@nestjs/common';
import { UserService } from '../user/user.service';

export interface LobbyUser {
  id: string;
  nickname: string;
  level: number;
  x: number;
  y: number;
  socketId: string;
}

export interface ChatMessage {
  userId: string;
  nickname: string;
  message: string;
  timestamp: Date;
}

export interface EmoteEvent {
  userId: string;
  nickname: string;
  type: 'happy' | 'sad' | 'angry';
  timestamp: Date;
}

@Injectable()
export class LobbyService {
  private readonly logger = new Logger(LobbyService.name);
  private readonly MOVEMENT_SPEED = 5; // pixels per move
  private readonly LOBBY_BOUNDS = {
    minX: -500,
    maxX: 500,
    minY: -500,
    maxY: 500,
  };

  // Rate limiting maps
  private lastMoveTime = new Map<string, number>();
  private lastChatTime = new Map<string, number>();

  constructor(private userService: UserService) {
    // Cleanup rate limiting maps every minute
    setInterval(() => this.cleanupRateLimits(), 60000);
  }

  /**
   * Get lobby snapshot for user
   */
  async getLobbySnapshot(userId: string): Promise<{
    users: LobbyUser[];
    userPosition: { x: number; y: number };
  }> {
    const onlineUsers = await this.userService.getOnlineUsers();
    const currentUser = await this.userService.findById(userId);

    const lobbyUsers: LobbyUser[] = onlineUsers
      .filter(user => user.socketId && !user.isInBattle)
      .map(user => ({
        id: user.id,
        nickname: user.nickname,
        level: user.creature.level,
        x: user.position.x,
        y: user.position.y,
        socketId: user.socketId!,
      }));

    return {
      users: lobbyUsers,
      userPosition: currentUser?.position || { x: 0, y: 0 },
    };
  }

  /**
   * Handle user movement with server authority
   */
  async handleMovement(
    userId: string, 
    direction: 'up' | 'down' | 'left' | 'right'
  ): Promise<{ x: number; y: number } | null> {
    // Rate limiting: max 20 moves per second
    const now = Date.now();
    const lastMove = this.lastMoveTime.get(userId) || 0;
    if (now - lastMove < 50) { // 50ms = 20 moves/second
      return null; // Rate limited
    }
    this.lastMoveTime.set(userId, now);

    // Get current user
    const user = await this.userService.findById(userId);
    if (!user || !user.socketId) {
      return null;
    }

    // Calculate new position
    let newX = user.position.x;
    let newY = user.position.y;

    switch (direction) {
      case 'up':
        newY -= this.MOVEMENT_SPEED;
        break;
      case 'down':
        newY += this.MOVEMENT_SPEED;
        break;
      case 'left':
        newX -= this.MOVEMENT_SPEED;
        break;
      case 'right':
        newX += this.MOVEMENT_SPEED;
        break;
    }

    // Clamp to lobby bounds
    newX = Math.max(this.LOBBY_BOUNDS.minX, Math.min(this.LOBBY_BOUNDS.maxX, newX));
    newY = Math.max(this.LOBBY_BOUNDS.minY, Math.min(this.LOBBY_BOUNDS.maxY, newY));

    // Update position if changed
    if (newX !== user.position.x || newY !== user.position.y) {
      await this.userService.updatePosition(userId, newX, newY);
      return { x: newX, y: newY };
    }

    return null; // No movement (hit boundary)
  }

  /**
   * Handle chat message
   */
  async handleChat(userId: string, message: string): Promise<ChatMessage | null> {
    // Rate limiting: max 2 messages per second
    const now = Date.now();
    const lastChat = this.lastChatTime.get(userId) || 0;
    if (now - lastChat < 500) { // 500ms = 2 messages/second
      return null; // Rate limited
    }
    this.lastChatTime.set(userId, now);

    // Validate message
    if (!message || message.length > 200) {
      return null;
    }

    // Get user
    const user = await this.userService.findById(userId);
    if (!user || !user.socketId) {
      return null;
    }

    // Create chat message
    const chatMessage: ChatMessage = {
      userId: user.id,
      nickname: user.nickname,
      message: message.trim(),
      timestamp: new Date(),
    };

    this.logger.log(`Chat: ${user.nickname}: ${message}`);
    return chatMessage;
  }

  /**
   * Handle emote
   */
  async handleEmote(userId: string, type: 'happy' | 'sad' | 'angry'): Promise<EmoteEvent | null> {
    // Rate limiting: same as chat
    const now = Date.now();
    const lastChat = this.lastChatTime.get(userId) || 0;
    if (now - lastChat < 500) {
      return null; // Rate limited
    }
    this.lastChatTime.set(userId, now);

    // Get user
    const user = await this.userService.findById(userId);
    if (!user || !user.socketId) {
      return null;
    }

    // Create emote event
    const emoteEvent: EmoteEvent = {
      userId: user.id,
      nickname: user.nickname,
      type,
      timestamp: new Date(),
    };

    this.logger.log(`Emote: ${user.nickname} -> ${type}`);
    return emoteEvent;
  }

  /**
   * Handle user joining lobby
   */
  async handleJoin(userId: string): Promise<void> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Ensure user is not in battle
    if (user.isInBattle) {
      await this.userService.setInBattle(userId, false);
    }

    this.logger.log(`User joined lobby: ${user.nickname} (${userId})`);
  }

  /**
   * Handle user leaving lobby
   */
  async handleLeave(userId: string): Promise<void> {
    // Cleanup any lobby-specific state if needed
    this.lastMoveTime.delete(userId);
    this.lastChatTime.delete(userId);

    this.logger.log(`User left lobby: ${userId}`);
  }

  /**
   * Cleanup rate limiting maps
   */
  private cleanupRateLimits(): void {
    const now = Date.now();
    const timeout = 60000; // 1 minute

    // Cleanup old entries
    for (const [userId, timestamp] of this.lastMoveTime.entries()) {
      if (now - timestamp > timeout) {
        this.lastMoveTime.delete(userId);
      }
    }

    for (const [userId, timestamp] of this.lastChatTime.entries()) {
      if (now - timestamp > timeout) {
        this.lastChatTime.delete(userId);
      }
    }
  }

  /**
   * Get lobby stats
   */
  async getStats() {
    const onlineUsers = await this.userService.getOnlineUsers();
    const lobbyUsers = onlineUsers.filter(user => !user.isInBattle);

    return {
      totalOnline: onlineUsers.length,
      inLobby: lobbyUsers.length,
      inBattle: onlineUsers.length - lobbyUsers.length,
      rateLimitEntries: {
        movement: this.lastMoveTime.size,
        chat: this.lastChatTime.size,
      },
    };
  }
}
