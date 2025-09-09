import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { NonceRecord, NonceResponse } from './interfaces/nonce.interface';

@Injectable()
export class NonceService {
  private nonces = new Map<string, NonceRecord>();
  private readonly nonceTtlMs: number;
  private readonly domain: string;

  constructor(private configService: ConfigService) {
    this.nonceTtlMs = this.configService.get<number>('NONCE_TTL_SECONDS', 300) * 1000;
    this.domain = this.configService.get<string>('DOMAIN', 'pokemon-arena.local');
    
    // Cleanup expired nonces every minute
    setInterval(() => this.cleanupExpiredNonces(), 60000);
  }

  /**
   * Generate a new nonce for the given wallet
   */
  generateNonce(wallet: string): NonceResponse {
    // Invalidate any existing nonce for this wallet
    this.invalidateWalletNonces(wallet);

    const nonce = randomUUID();
    const now = Date.now();
    const expiresAt = now + this.nonceTtlMs;

    const nonceRecord: NonceRecord = {
      wallet,
      nonce,
      issuedAt: now,
      expiresAt,
      used: false,
    };

    this.nonces.set(nonce, nonceRecord);

    return {
      nonce,
      domain: this.domain,
      statement: 'Sign in to Pokémon Summon Arena',
      issuedAt: new Date(now).toISOString(),
      expirationTime: new Date(expiresAt).toISOString(),
    };
  }

  /**
   * Validate and consume a nonce
   */
  validateAndConsumeNonce(nonce: string, wallet: string): { valid: boolean; reason?: string } {
    const nonceRecord = this.nonces.get(nonce);

    if (!nonceRecord) {
      return { valid: false, reason: 'NONCE_NOT_FOUND' };
    }

    if (nonceRecord.wallet !== wallet) {
      return { valid: false, reason: 'WALLET_MISMATCH' };
    }

    if (nonceRecord.used) {
      return { valid: false, reason: 'NONCE_ALREADY_USED' };
    }

    const now = Date.now();
    if (now > nonceRecord.expiresAt) {
      this.nonces.delete(nonce);
      return { valid: false, reason: 'NONCE_EXPIRED' };
    }

    // Mark as used
    nonceRecord.used = true;
    this.nonces.set(nonce, nonceRecord);

    // Schedule deletion after a short delay
    setTimeout(() => this.nonces.delete(nonce), 5000);

    return { valid: true };
  }

  /**
   * Invalidate all nonces for a wallet (when generating new one)
   */
  private invalidateWalletNonces(wallet: string): void {
    for (const [nonce, record] of this.nonces.entries()) {
      if (record.wallet === wallet) {
        this.nonces.delete(nonce);
      }
    }
  }

  /**
   * Cleanup expired nonces
   */
  private cleanupExpiredNonces(): void {
    const now = Date.now();
    for (const [nonce, record] of this.nonces.entries()) {
      if (now > record.expiresAt) {
        this.nonces.delete(nonce);
      }
    }
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    let used = 0;

    for (const record of this.nonces.values()) {
      if (record.used) {
        used++;
      } else if (now > record.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.nonces.size,
      active,
      expired,
      used,
    };
  }
}
