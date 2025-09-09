import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nacl from 'tweetnacl';
const bs58 = require('bs58');

export interface SiwsMessage {
  domain: string;
  statement: string;
  uri: string;
  version: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  [key: string]: any;
}

@Injectable()
export class SiwsService {
  private readonly logger = new Logger(SiwsService.name);
  private readonly domain: string;
  private readonly clockSkewMs = 5 * 60 * 1000; // 5 minutes

  constructor(private configService: ConfigService) {
    this.domain = this.configService.get<string>('DOMAIN', 'pokemon-arena.local');
  }

  /**
   * Verify SIWS signature and message
   */
  verifySiws(wallet: string, message: string, signature: string): { 
    valid: boolean; 
    reason?: string; 
    parsedMessage?: SiwsMessage 
  } {
    try {
      // 1. Parse message
      const parsedMessage = this.parseMessage(message);
      if (!parsedMessage) {
        return { valid: false, reason: 'INVALID_MESSAGE_FORMAT' };
      }

      // 2. Validate message structure
      const structureValidation = this.validateMessageStructure(parsedMessage);
      if (!structureValidation.valid) {
        return { valid: false, reason: structureValidation.reason };
      }

      // 3. Validate domain
      if (parsedMessage.domain !== this.domain) {
        return { valid: false, reason: 'INVALID_DOMAIN' };
      }

      // 4. Validate time window
      const timeValidation = this.validateTimeWindow(parsedMessage);
      if (!timeValidation.valid) {
        return { valid: false, reason: timeValidation.reason };
      }

      // 5. Verify Ed25519 signature
      const signatureValid = this.verifySignature(wallet, message, signature);
      if (!signatureValid) {
        return { valid: false, reason: 'INVALID_SIGNATURE' };
      }

      return { valid: true, parsedMessage };

    } catch (error) {
      this.logger.error('SIWS verification error:', error);
      return { valid: false, reason: 'VERIFICATION_ERROR' };
    }
  }

  /**
   * Parse SIWS message into structured format
   */
  private parseMessage(message: string): SiwsMessage | null {
    try {
      this.logger.log('Parsing SIWS message:', message);
      const lines = message.split('\n');
      this.logger.log('Message lines:', lines);
      const parsed: any = {};

      // First line should be the statement
      if (!lines[0] || !lines[0].includes('wants you to sign in')) {
        this.logger.error('Invalid first line:', lines[0]);
        return null;
      }

      // Check if wallet is on the same line or next line
      let walletMatch = lines[0].match(/sign in with your Solana account:\s*([A-Za-z0-9]+)/);
      if (!walletMatch && lines[1]) {
        // Try to find wallet on the second line
        const walletLine = lines[1].trim();
        if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletLine)) {
          walletMatch = ['', walletLine]; // Fake match array format
        }
      }
      if (!walletMatch) return null;

      // Parse key-value pairs
      // Start from line 2 if wallet is on separate line, otherwise line 1
      const startLine = lines[1] && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(lines[1].trim()) ? 2 : 1;

      for (let i = startLine; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        switch (key) {
          case 'Domain':
            parsed.domain = value;
            break;
          case 'Statement':
            parsed.statement = value;
            break;
          case 'URI':
            parsed.uri = value;
            break;
          case 'Version':
            parsed.version = value;
            break;
          case 'Nonce':
            parsed.nonce = value;
            break;
          case 'Issued At':
            parsed.issuedAt = value;
            break;
          case 'Expiration Time':
            parsed.expirationTime = value;
            break;
        }
      }

      this.logger.log('Parsed message:', parsed);
      return parsed as SiwsMessage;
    } catch (error) {
      this.logger.error('Message parsing error:', error);
      return null;
    }
  }

  /**
   * Validate message has required fields
   */
  private validateMessageStructure(message: SiwsMessage): { valid: boolean; reason?: string } {
    const requiredFields = ['domain', 'nonce', 'issuedAt', 'expirationTime'];
    
    for (const field of requiredFields) {
      if (!message[field]) {
        return { valid: false, reason: `MISSING_FIELD_${field.toUpperCase()}` };
      }
    }

    return { valid: true };
  }

  /**
   * Validate time window (issued at and expiration time)
   */
  private validateTimeWindow(message: SiwsMessage): { valid: boolean; reason?: string } {
    try {
      const now = Date.now();
      const issuedAt = new Date(message.issuedAt).getTime();
      const expirationTime = new Date(message.expirationTime).getTime();

      // Check if dates are valid
      if (isNaN(issuedAt) || isNaN(expirationTime)) {
        return { valid: false, reason: 'INVALID_DATE_FORMAT' };
      }

      // Check if not issued in the future (with clock skew)
      if (issuedAt > now + this.clockSkewMs) {
        return { valid: false, reason: 'ISSUED_IN_FUTURE' };
      }

      // Check if not expired (with clock skew)
      if (expirationTime < now - this.clockSkewMs) {
        return { valid: false, reason: 'MESSAGE_EXPIRED' };
      }

      // Check if expiration is after issued at
      if (expirationTime <= issuedAt) {
        return { valid: false, reason: 'INVALID_TIME_RANGE' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'TIME_VALIDATION_ERROR' };
    }
  }

  /**
   * Verify Ed25519 signature
   */
  private verifySignature(wallet: string, message: string, signature: string): boolean {
    try {
      // Decode wallet public key from base58
      const publicKey = bs58.decode(wallet);
      
      // Decode signature from base64
      const signatureBytes = Buffer.from(signature, 'base64');
      
      // Encode message as UTF-8
      const messageBytes = new TextEncoder().encode(message);

      // Verify signature
      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
    } catch (error) {
      this.logger.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Generate SIWS message template
   */
  generateMessageTemplate(wallet: string, nonce: string, issuedAt: string, expirationTime: string): string {
    return [
      `Pokémon Summon Arena wants you to sign in with your Solana account:`,
      wallet,
      '',
      `URI: https://${this.domain}`,
      `Domain: ${this.domain}`,
      `Statement: Sign in to Pokémon Summon Arena`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      `Expiration Time: ${expirationTime}`,
      `Version: 1`
    ].join('\n');
  }
}
