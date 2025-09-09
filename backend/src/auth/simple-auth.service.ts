import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nacl from 'tweetnacl';
const bs58 = require('bs58');

export interface SimpleAuthChallenge {
  nonce: string;
  message: string;
  issuedAt: string;
  expirationTime: string;
}

@Injectable()
export class SimpleAuthService {
  private readonly logger = new Logger(SimpleAuthService.name);
  private readonly appName = 'Pokémon Summon Arena';
  private readonly nonceValidityMs = 5 * 60 * 1000; // 5 minutes

  constructor(private configService: ConfigService) {}

  /**
   * Generate simple authentication challenge
   */
  generateChallenge(walletAddress: string): SimpleAuthChallenge {
    const nonce = this.generateNonce();
    const issuedAt = new Date().toISOString();
    const expirationTime = new Date(Date.now() + this.nonceValidityMs).toISOString();
    
    const message = this.buildSimpleMessage(walletAddress, nonce, issuedAt);

    return {
      nonce,
      message,
      issuedAt,
      expirationTime,
    };
  }

  /**
   * Verify simple text message signature
   */
  verifySignature(
    walletAddress: string,
    message: string,
    signature: string,
    issuedAt?: string
  ): { valid: boolean; reason?: string } {
    try {
      // 1. Validate message format
      if (!this.validateMessageFormat(message, walletAddress)) {
        return { valid: false, reason: 'INVALID_MESSAGE_FORMAT' };
      }

      // 2. Check time validity if provided
      if (issuedAt) {
        const timeValidation = this.validateTimeWindow(issuedAt);
        if (!timeValidation.valid) {
          return { valid: false, reason: timeValidation.reason };
        }
      }

      // 3. Verify Ed25519 signature
      const signatureValid = this.verifyEd25519Signature(walletAddress, message, signature);
      if (!signatureValid) {
        return { valid: false, reason: 'INVALID_SIGNATURE' };
      }

      return { valid: true };

    } catch (error) {
      this.logger.error('Simple auth verification error:', error);
      return { valid: false, reason: 'VERIFICATION_ERROR' };
    }
  }

  /**
   * Build simple authentication message
   */
  private buildSimpleMessage(walletAddress: string, nonce: string, issuedAt: string): string {
    return `Welcome to ${this.appName}!\n\nPlease sign this message to authenticate your wallet.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTime: ${issuedAt}`;
  }

  /**
   * Generate secure random nonce
   */
  private generateNonce(): string {
    return Array.from(nacl.randomBytes(16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Validate message format
   */
  private validateMessageFormat(message: string, expectedWallet: string): boolean {
    try {
      // Check if message contains expected components
      return (
        message.includes(this.appName) &&
        message.includes('authenticate your wallet') &&
        message.includes(`Wallet: ${expectedWallet}`) &&
        message.includes('Nonce:') &&
        message.includes('Time:')
      );
    } catch (error) {
      this.logger.error('Message format validation error:', error);
      return false;
    }
  }

  /**
   * Validate time window
   */
  private validateTimeWindow(issuedAt: string): { valid: boolean; reason?: string } {
    try {
      const now = Date.now();
      const issued = new Date(issuedAt).getTime();

      // Check if date is valid
      if (isNaN(issued)) {
        return { valid: false, reason: 'INVALID_DATE_FORMAT' };
      }

      // Check if not too old
      if (now - issued > this.nonceValidityMs) {
        return { valid: false, reason: 'MESSAGE_EXPIRED' };
      }

      // Check if not in future (with 1 minute tolerance)
      if (issued > now + 60000) {
        return { valid: false, reason: 'ISSUED_IN_FUTURE' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'TIME_VALIDATION_ERROR' };
    }
  }

  /**
   * Verify Ed25519 signature using nacl
   */
  private verifyEd25519Signature(walletAddress: string, message: string, signature: string): boolean {
    try {
      this.logger.log(`Verifying signature for wallet: ${walletAddress}`);
      this.logger.log(`Message length: ${message.length}`);
      this.logger.log(`Signature: ${signature}`);

      // Decode wallet public key from base58
      const publicKey = bs58.decode(walletAddress);
      this.logger.log(`Public key length: ${publicKey.length}`);

      // Decode signature from base64
      const signatureBytes = Buffer.from(signature, 'base64');
      this.logger.log(`Signature bytes length: ${signatureBytes.length}`);

      // Encode message as UTF-8
      const messageBytes = new TextEncoder().encode(message);
      this.logger.log(`Message bytes length: ${messageBytes.length}`);

      // Verify signature
      const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
      this.logger.log(`Signature verification result: ${isValid}`);

      return isValid;
    } catch (error) {
      this.logger.error('Ed25519 signature verification error:', error);
      return false;
    }
  }
}
