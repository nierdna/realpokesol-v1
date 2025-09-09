import { Injectable, Logger, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { NonceService } from './nonce.service';
import { SimpleAuthService } from './simple-auth.service';
import { SiwsRequest, SiwsResponse, SessionRecord } from './interfaces/nonce.interface';
import type { IUserRepository } from '../storage/ports/user-repository.interface';
import { User } from '../storage/ports/user-repository.interface';
import { STORAGE_TOKENS } from '../storage/tokens';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private sessions = new Map<string, SessionRecord>(); // jti -> session

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private nonceService: NonceService,
    private simpleAuthService: SimpleAuthService,
    @Inject(STORAGE_TOKENS.UserRepository)
    private userRepository: IUserRepository,
  ) {
    // Cleanup expired sessions every 10 minutes
    setInterval(() => this.cleanupExpiredSessions(), 10 * 60 * 1000);
  }

  /**
   * Generate simple auth challenge for wallet
   */
  generateNonce(wallet: string) {
    const challenge = this.simpleAuthService.generateChallenge(wallet);
    
    // Store nonce for validation later
    this.nonceService.generateNonce(wallet, challenge.nonce);
    
    return {
      nonce: challenge.nonce,
      domain: this.configService.get<string>('DOMAIN', 'pokemon-arena.local'),
      statement: 'Sign in to Pokémon Summon Arena',
      message: challenge.message,
      issuedAt: challenge.issuedAt,
      expirationTime: challenge.expirationTime,
    };
  }

  /**
   * Verify simple auth and issue JWT token
   */
  async verifySiws(siwsRequest: SiwsRequest): Promise<SiwsResponse> {
    const { wallet, message, signature } = siwsRequest;

    // 1. Verify simple auth signature and message
    const authResult = this.simpleAuthService.verifySignature(wallet, message, signature);
    if (!authResult.valid) {
      throw new Error(`Simple auth verification failed: ${authResult.reason}`);
    }

    // 2. Extract nonce from message and validate
    const nonceMatch = message.match(/Nonce: ([a-f0-9]+)/);
    if (!nonceMatch) {
      throw new Error('Nonce not found in message');
    }
    
    const nonce = nonceMatch[1];
    const nonceResult = this.nonceService.validateAndConsumeNonce(nonce, wallet);
    if (!nonceResult.valid) {
      throw new Error(`Nonce validation failed: ${nonceResult.reason}`);
    }

    // 3. Find or create user
    let user = await this.userRepository.findByWallet(wallet);
    if (!user) {
      user = await this.createUser(wallet);
      this.logger.log(`New user created for wallet: ${wallet}`);
    } else {
      await this.userRepository.update({
        id: user.id,
        lastLoginAt: new Date(),
      });
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

      return this.userRepository.findById(session.userId);
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
   * Create new user
   */
  private async createUser(wallet: string): Promise<User> {
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

    await this.userRepository.create(user);
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
  async getStats() {
    const nonceStats = this.nonceService.getStats();
    const onlineUsers = await this.userRepository.listOnline();

    return {
      users: {
        online: onlineUsers.length,
      },
      sessions: {
        active: this.sessions.size,
      },
      nonces: nonceStats,
    };
  }
}
