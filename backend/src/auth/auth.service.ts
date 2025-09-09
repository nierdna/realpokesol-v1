import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { NonceService } from './nonce.service';
import { SiwsService } from './siws.service';
import { SiwsRequest, SiwsResponse, SessionRecord } from './interfaces/nonce.interface';

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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private users = new Map<string, User>();
  private walletIndex = new Map<string, string>(); // wallet -> userId
  private sessions = new Map<string, SessionRecord>(); // jti -> session

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private nonceService: NonceService,
    private siwsService: SiwsService,
  ) {
    // Cleanup expired sessions every 10 minutes
    setInterval(() => this.cleanupExpiredSessions(), 10 * 60 * 1000);
  }

  /**
   * Generate nonce for wallet
   */
  generateNonce(wallet: string) {
    return this.nonceService.generateNonce(wallet);
  }

  /**
   * Verify SIWS and issue JWT token
   */
  async verifySiws(siwsRequest: SiwsRequest): Promise<SiwsResponse> {
    const { wallet, message, signature } = siwsRequest;

    // 1. Verify SIWS signature and message
    const siwsResult = this.siwsService.verifySiws(wallet, message, signature);
    if (!siwsResult.valid) {
      throw new Error(`SIWS verification failed: ${siwsResult.reason}`);
    }

    // 2. Validate and consume nonce
    const nonceResult = this.nonceService.validateAndConsumeNonce(
      siwsResult.parsedMessage!.nonce,
      wallet
    );
    if (!nonceResult.valid) {
      throw new Error(`Nonce validation failed: ${nonceResult.reason}`);
    }

    // 3. Find or create user
    let user = this.findUserByWallet(wallet);
    if (!user) {
      user = this.createUser(wallet);
      this.logger.log(`New user created for wallet: ${wallet}`);
    } else {
      user.lastLoginAt = new Date();
      this.logger.log(`Existing user logged in: ${user.id}`);
    }

    // 4. Issue JWT token
    const tokenId = randomUUID();
    const now = Date.now();
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '3600s');
    const expirationMs = this.parseExpirationTime(expiresIn);

    const payload = {
      sub: user.id,
      aud: this.configService.get<string>('DOMAIN', 'pokemon-arena.local'),
      iss: this.configService.get<string>('DOMAIN', 'pokemon-arena.local'),
      jti: tokenId,
      ver: '1',
      wallet: user.walletAddress,
    };

    const accessToken = this.jwtService.sign(payload);

    // 5. Store session
    const session: SessionRecord = {
      userId: user.id,
      tokenId,
      issuedAt: now,
      expiresAt: now + expirationMs,
    };
    this.sessions.set(tokenId, session);

    return {
      accessToken,
      user: {
        id: user.id,
        nickname: user.nickname,
        walletAddress: user.walletAddress,
        creature: user.creature,
      },
    };
  }

  /**
   * Verify JWT token and get user
   */
  async verifyToken(token: string): Promise<User | null> {
    try {
      const payload = this.jwtService.verify(token);
      const session = this.sessions.get(payload.jti);

      if (!session || Date.now() > session.expiresAt) {
        return null;
      }

      return this.findUserById(session.userId);
    } catch (error) {
      this.logger.warn(`Token verification failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Revoke session
   */
  revokeSession(tokenId: string): void {
    this.sessions.delete(tokenId);
  }

  /**
   * Find user by ID
   */
  findUserById(userId: string): User | null {
    return this.users.get(userId) || null;
  }

  /**
   * Find user by wallet address
   */
  findUserByWallet(wallet: string): User | null {
    const userId = this.walletIndex.get(wallet);
    return userId ? this.users.get(userId) || null : null;
  }

  /**
   * Create new user
   */
  private createUser(wallet: string): User {
    const userId = randomUUID();
    const nickname = `Player${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
    
    const user: User = {
      id: userId,
      nickname,
      walletAddress: wallet,
      position: { x: 0, y: 0 },
      creature: {
        name: 'Starter Pokemon',
        hp: 55, // 50 + (1 * 5)
        maxHp: 55,
        level: 1,
        isFainted: false,
      },
      isInBattle: false,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    };

    this.users.set(userId, user);
    this.walletIndex.set(wallet, userId);

    return user;
  }

  /**
   * Parse expiration time string to milliseconds
   */
  private parseExpirationTime(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 60 * 60 * 1000; // default 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [tokenId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(tokenId);
      }
    }
  }

  /**
   * Get auth stats for monitoring
   */
  getStats() {
    const nonceStats = this.nonceService.getStats();
    return {
      users: {
        total: this.users.size,
      },
      sessions: {
        active: this.sessions.size,
      },
      nonces: nonceStats,
    };
  }
}
