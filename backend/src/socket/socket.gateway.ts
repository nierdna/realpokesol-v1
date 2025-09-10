import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { LobbyService } from '../lobby/lobby.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { BattleService } from '../battle/battle.service';
import { MATCH_EVENTS } from '../matchmaking/events/match.events';
import type {
  MatchCreatedEvent,
  MatchTimeoutEvent,
  MatchQueueJoinedEvent,
} from '../matchmaking/events/match.events';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    user: any;
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  transports: ['websocket'],
  pingInterval: 20000,
  pingTimeout: 20000,
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketGateway.name);

  // Track active sessions (single-session policy)
  private activeSessions = new Map<string, string>(); // userId -> socketId

  // Track battle ready state for multiple clients
  private battleReadyState = new Map<
    string,
    {
      expectedPlayers: string[]; // [player1Id, player2Id]
      readyPlayers: Set<string>;
      battleStarted: boolean;
      timeout?: NodeJS.Timeout;
    }
  >();

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
    private userService: UserService,
    private lobbyService: LobbyService,
    private matchmakingService: MatchmakingService,
    private battleService: BattleService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Socket.io Gateway initialized');
    this.logger.log(
      `CORS origins: ${process.env.CORS_ORIGINS || 'http://localhost:3000'}`,
    );
  }

  async handleConnection(client: Socket) {
    try {
      // Get token from auth object or headers
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`No token provided for socket: ${client.id}`);
        client.emit('error', {
          code: 'NO_TOKEN',
          message: 'Authentication token required',
        });
        client.disconnect();
        return;
      }

      // Verify token and get user
      const user = await this.authService.verifyToken(token);
      if (!user) {
        this.logger.warn(`Invalid token for socket: ${client.id}`);
        client.emit('error', {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
        });
        client.disconnect();
        return;
      }

      // Single-session policy: kick existing socket for this user
      const existingSocketId = this.activeSessions.get(user.id);
      if (existingSocketId) {
        const existingSocket =
          this.server.sockets.sockets.get(existingSocketId);
        if (existingSocket) {
          existingSocket.emit('replaced', {
            message: 'New session started elsewhere',
          });
          existingSocket.disconnect(true);
        }
      }

      // Store user data in socket
      client.data.userId = user.id;
      client.data.user = user;

      // Update active sessions
      this.activeSessions.set(user.id, client.id);

      // ✅ FIX: Bind socket immediately on connection, not just on lobby.join
      await this.userService.bindSocket(user.id, client.id);

      this.logger.log(
        `Socket authenticated: ${client.id} -> ${user.nickname} (${user.id})`,
      );

      // Send initial connection success
      client.emit('connected', {
        message: 'Connected successfully',
        user: {
          id: user.id,
          nickname: user.nickname,
          level: user.creature?.level || 1,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data?.userId;
    if (!userId) return;

    try {
      // Cleanup user state
      await this.userService.unbindSocket(userId);
      await this.lobbyService.handleLeave(userId);
      await this.matchmakingService.cleanup(userId);
      await this.battleService.cleanup(userId);

      // Remove from active sessions
      this.activeSessions.delete(userId);

      // Broadcast lobby update
      const lobbySnapshot = await this.lobbyService.getLobbySnapshot(userId);
      this.server
        .to('lobby')
        .emit('lobby.update', { users: lobbySnapshot.users });

      this.logger.log(`Client disconnected: ${client.id} (${userId})`);
    } catch (error) {
      this.logger.error(`Disconnect cleanup error: ${error.message}`);
    }
  }

  // ==================== LOBBY EVENTS ====================

  @SubscribeMessage('lobby.join')
  async handleLobbyJoin(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.data.userId;

    try {
      await this.lobbyService.handleJoin(userId);
      // ✅ Socket already bound in handleConnection, no need to bind again

      // Join lobby room
      await client.join('lobby');

      // Send lobby snapshot
      const snapshot = await this.lobbyService.getLobbySnapshot(userId);
      client.emit('lobby.snapshot', snapshot);

      // Broadcast user joined to others
      this.server.to('lobby').emit('lobby.update', { users: snapshot.users });

      this.logger.log(`User joined lobby: ${userId}`);
    } catch (error) {
      this.logger.error(`Lobby join error: ${error.message}`);
      client.emit('error', {
        code: 'LOBBY_JOIN_FAILED',
        message: error.message,
      });
    }
  }

  @SubscribeMessage('lobby.move')
  async handleLobbyMove(
    @MessageBody() data: { direction: 'up' | 'down' | 'left' | 'right' },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.userId;

    try {
      const newPosition = await this.lobbyService.handleMovement(
        userId,
        data.direction,
      );

      if (newPosition) {
        // Broadcast position update
        this.server.to('lobby').emit('lobby.position', {
          userId,
          x: newPosition.x,
          y: newPosition.y,
        });
      }
    } catch (error) {
      this.logger.error(`Lobby move error: ${error.message}`);
    }
  }

  @SubscribeMessage('lobby.chat')
  async handleLobbyChat(
    @MessageBody() data: { message: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.userId;

    try {
      const chatMessage = await this.lobbyService.handleChat(
        userId,
        data.message,
      );

      if (chatMessage) {
        // Broadcast chat to lobby
        this.server.to('lobby').emit('lobby.chat', chatMessage);
      }
    } catch (error) {
      this.logger.error(`Lobby chat error: ${error.message}`);
    }
  }

  @SubscribeMessage('lobby.emote')
  async handleLobbyEmote(
    @MessageBody() data: { type: 'happy' | 'sad' | 'angry' },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.userId;

    try {
      const emoteEvent = await this.lobbyService.handleEmote(userId, data.type);

      if (emoteEvent) {
        // Broadcast emote to lobby
        this.server.to('lobby').emit('lobby.emote', emoteEvent);
      }
    } catch (error) {
      this.logger.error(`Lobby emote error: ${error.message}`);
    }
  }

  // ==================== MATCHMAKING EVENTS ====================

  @SubscribeMessage('match.join')
  async handleMatchJoin(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.data.userId;

    try {
      // ✅ Only join queue - no tryCreateMatch call
      await this.matchmakingService.joinQueue(userId);

      // ✅ Trigger match check asynchronously to avoid blocking
      setImmediate(() => this.matchmakingService.checkForMatches());
    } catch (error) {
      this.logger.error(`Match join error: ${error.message}`);
      client.emit('error', {
        code: 'MATCH_JOIN_FAILED',
        message: error.message,
      });
    }
  }

  @SubscribeMessage('match.leave')
  async handleMatchLeave(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.data.userId;

    try {
      await this.matchmakingService.leaveQueue(userId);
      client.emit('match.left', { timestamp: new Date().toISOString() });
    } catch (error) {
      this.logger.error(`Match leave error: ${error.message}`);
    }
  }

  // ==================== BATTLE EVENTS ====================

  @SubscribeMessage('battle.ready')
  async handleBattleReady(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.userId;
    const roomId = data.roomId;

    try {
      const readyState = this.battleReadyState.get(roomId);
      if (!readyState || readyState.battleStarted) {
        this.logger.warn(
          `Battle ready ignored for ${roomId}: ${!readyState ? 'no state' : 'already started'}`,
        );
        return; // Battle đã bắt đầu hoặc room không tồn tại
      }

      // Kiểm tra user có thuộc battle này không
      if (!readyState.expectedPlayers.includes(userId)) {
        this.logger.warn(`User ${userId} not expected in battle ${roomId}`);
        client.emit('error', {
          code: 'NOT_IN_BATTLE',
          message: 'You are not part of this battle',
        });
        return;
      }

      // Mark player ready
      readyState.readyPlayers.add(userId);

      this.logger.log(
        `Battle ${roomId}: Player ${userId} ready (${readyState.readyPlayers.size}/${readyState.expectedPlayers.length})`,
      );

      // ✅ Chỉ start battle khi CẢ 2 players ready
      if (readyState.readyPlayers.size === readyState.expectedPlayers.length) {
        await this.startBattleWhenReady(roomId);
      }
    } catch (error) {
      this.logger.error(`Battle ready error: ${error.message}`);
      client.emit('error', {
        code: 'BATTLE_READY_FAILED',
        message: error.message,
      });
    }
  }

  @SubscribeMessage('battle.action')
  async handleBattleAction(
    @MessageBody() data: { action: 'attack'; requestId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.userId;

    try {
      // Find user's battle
      const userBattle = await this.battleService.handleReconnect(userId);
      if (!userBattle) {
        client.emit('error', {
          code: 'NO_BATTLE',
          message: 'Not in an active battle',
        });
        return;
      }

      const result = await this.battleService.processAction(
        userBattle.battleId,
        userId,
        data.action,
        data.requestId,
      );

      if (!result) {
        return; // Invalid action or already processed
      }

      // Broadcast turn result
      this.server
        .to(`battle-${userBattle.battleId}`)
        .emit('battle.turn', result);

      // If battle ended, handle cleanup
      if (result.battleEnded && result.winnerId) {
        const battleEnd = await this.battleService.endBattle(
          userBattle.battleId,
          result.winnerId,
        );

        // Send battle end
        this.server
          .to(`battle-${userBattle.battleId}`)
          .emit('battle.end', battleEnd);

        // Move players back to lobby
        const battleRoom = this.server.sockets.adapter.rooms.get(
          `battle-${userBattle.battleId}`,
        );
        if (battleRoom) {
          for (const socketId of battleRoom) {
            const socket = this.server.sockets.sockets.get(socketId);
            if (socket) {
              socket.leave(`battle-${userBattle.battleId}`);
              socket.join('lobby');
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Battle action error: ${error.message}`);
      client.emit('error', {
        code: 'BATTLE_ACTION_FAILED',
        message: error.message,
      });
    }
  }

  // ==================== UTILITY METHODS ====================

  private getSocketByUserId(userId: string): Socket | null {
    const socketId = this.activeSessions.get(userId);
    return socketId ? this.server.sockets.sockets.get(socketId) || null : null;
  }

  // ==================== EVENT LISTENERS ====================

  /**
   * ✅ Handle match created event
   */
  @OnEvent(MATCH_EVENTS.MATCH_CREATED)
  async handleMatchCreated(event: MatchCreatedEvent) {
    const { match } = event;

    try {
      // Get sockets for both players
      const player1Socket = this.getSocketByUserId(match.player1Id);
      const player2Socket = this.getSocketByUserId(match.player2Id);

      if (!player1Socket || !player2Socket) {
        this.logger.error(
          `Cannot find sockets for match ${match.roomId}: p1=${!!player1Socket}, p2=${!!player2Socket}`,
        );
        // Cleanup match if sockets not found
        await this.matchmakingService.cleanup(match.player1Id);
        await this.matchmakingService.cleanup(match.player2Id);
        return;
      }

      // Leave lobby room
      player1Socket.leave('lobby');
      player2Socket.leave('lobby');

      // Join battle room
      const battleRoom = `battle-${match.roomId}`;
      player1Socket.join(battleRoom);
      player2Socket.join(battleRoom);

      // ✅ Initialize battle ready state tracking
      this.battleReadyState.set(match.roomId, {
        expectedPlayers: [match.player1Id, match.player2Id],
        readyPlayers: new Set(),
        battleStarted: false,
      });

      // Create battle
      await this.battleService.createBattle(
        match.player1Id,
        match.player2Id,
        match.roomId,
      );

      // Send match found to both players (không emit battle.start ngay)
      player1Socket.emit('match.found', {
        roomId: match.roomId,
        opponent: match.player2,
      });
      player2Socket.emit('match.found', {
        roomId: match.roomId,
        opponent: match.player1,
      });

      // ✅ Set timeout để tránh deadlock
      const timeoutId = setTimeout(() => {
        this.handleBattleReadyTimeout(match.roomId);
      }, 10000); // 10 seconds timeout

      this.battleReadyState.get(match.roomId)!.timeout = timeoutId;

      this.logger.log(
        `✅ Match setup completed: ${match.roomId} - waiting for players to be ready`,
      );
    } catch (error) {
      this.logger.error(`Error handling match created: ${error.message}`);
      // Cleanup on error
      await this.matchmakingService.cleanup(match.player1Id);
      await this.matchmakingService.cleanup(match.player2Id);
      this.battleReadyState.delete(match.roomId);
    }
  }

  /**
   * ✅ Handle queue joined event
   */
  @OnEvent(MATCH_EVENTS.MATCH_QUEUE_JOINED)
  async handleQueueJoined(event: MatchQueueJoinedEvent) {
    const socket = this.getSocketByUserId(event.userId);
    if (socket) {
      socket.emit('match.queued', {
        position: event.position,
        queueLength: event.queueLength,
        estimatedWait: 0, // Can calculate based on historical data
      });
    }
  }

  /**
   * ✅ Handle match timeout event
   */
  @OnEvent(MATCH_EVENTS.MATCH_TIMEOUT)
  async handleMatchTimeout(event: MatchTimeoutEvent) {
    const socket = this.getSocketByUserId(event.userId);
    if (socket) {
      socket.emit('match.timeout', {
        reason: event.reason,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ==================== BATTLE HELPER METHODS ====================

  /**
   * Start battle when both players are ready
   */
  private async startBattleWhenReady(roomId: string) {
    const readyState = this.battleReadyState.get(roomId);
    if (!readyState || readyState.battleStarted) {
      return;
    }

    // Mark as started để tránh duplicate
    readyState.battleStarted = true;

    // Clear timeout
    if (readyState.timeout) {
      clearTimeout(readyState.timeout);
    }

    try {
      const battleState = await this.battleService.getBattleState(roomId);
      const battleRoom = `battle-${roomId}`;

      // Debug log
      this.logger.log(`🔍 Starting battle for room ${roomId}:`);
      this.logger.log(
        `- Battle State: ${JSON.stringify(battleState, null, 2)}`,
      );

      // ✅ Emit battle.start một lần duy nhất
      this.server.to(battleRoom).emit('battle.start', {
        roomId,
        battleState,
      });

      this.logger.log(`✅ Battle started: ${roomId} - both players ready`);
    } catch (error) {
      this.logger.error(`Error starting battle ${roomId}: ${error.message}`);

      // Notify players về lỗi
      const battleRoom = `battle-${roomId}`;
      this.server.to(battleRoom).emit('error', {
        code: 'BATTLE_START_FAILED',
        message: 'Failed to start battle',
      });
    } finally {
      // Cleanup
      this.battleReadyState.delete(roomId);
    }
  }

  /**
   * Handle battle ready timeout
   */
  private async handleBattleReadyTimeout(roomId: string) {
    const readyState = this.battleReadyState.get(roomId);
    if (!readyState || readyState.battleStarted) {
      return;
    }

    this.logger.warn(
      `Battle ready timeout for room ${roomId}. Ready players: ${readyState.readyPlayers.size}/${readyState.expectedPlayers.length}`,
    );

    // Notify players về timeout
    const battleRoom = `battle-${roomId}`;
    this.server.to(battleRoom).emit('battle.timeout', {
      reason: 'Players not ready in time',
      readyCount: readyState.readyPlayers.size,
      expectedCount: readyState.expectedPlayers.length,
      timestamp: new Date().toISOString(),
    });

    // Cleanup battle ready state
    this.battleReadyState.delete(roomId);

    try {
      // Cleanup battle service state
      await this.battleService.cleanup(readyState.expectedPlayers[0]);
      await this.battleService.cleanup(readyState.expectedPlayers[1]);

      // Return players to lobby
      const battleRoom = this.server.sockets.adapter.rooms.get(
        `battle-${roomId}`,
      );
      if (battleRoom) {
        for (const socketId of battleRoom) {
          const socket = this.server.sockets.sockets.get(socketId);
          if (socket) {
            socket.leave(`battle-${roomId}`);
            socket.join('lobby');
            socket.emit('match.timeout', {
              reason: 'Battle setup timeout',
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Error handling battle timeout cleanup: ${error.message}`,
      );
    }
  }

  // ==================== ADMIN/DEBUG EVENTS ====================

  @SubscribeMessage('debug.stats')
  async handleDebugStats(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      const [userStats, lobbyStats, matchStats, battleStats] =
        await Promise.all([
          this.userService.getStats(),
          this.lobbyService.getStats(),
          this.matchmakingService.getStats(),
          this.battleService.getStats(),
        ]);

      client.emit('debug.stats', {
        user: userStats,
        lobby: lobbyStats,
        matchmaking: matchStats,
        battle: battleStats,
        socket: {
          connected: this.server.sockets.sockets.size,
          activeSessions: this.activeSessions.size,
        },
      });
    } catch (error) {
      client.emit('error', { code: 'STATS_ERROR', message: error.message });
    }
  }
}
