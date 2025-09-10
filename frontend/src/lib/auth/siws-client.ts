import { WalletContextState } from '@solana/wallet-adapter-react';

export interface NonceResponse {
  nonce: string;
  domain: string;
  statement: string;
  issuedAt: string;
  expirationTime: string;
}

export interface SiwsResponse {
  accessToken: string;
  user: {
    id: string;
    nickname: string;
    walletAddress: string;
    creature: {
      name: string;
      hp: number;
      maxHp: number;
      level: number;
      isFainted: boolean;
    };
  };
}

export class SiwsClient {
  private readonly apiUrl: string;

  constructor() {
    this.apiUrl = process.env.NEXT_PUBLIC_API_URL! + '/api';
  }

  /**
   * Get nonce for wallet
   */
  async getNonce(walletAddress: string): Promise<NonceResponse> {
    const response = await fetch(
      `${this.apiUrl}/auth/nonce?wallet=${encodeURIComponent(walletAddress)}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get nonce: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to get nonce');
    }

    return result.data;
  }

  /**
   * Sign SIWS message with wallet
   */
  async signMessage(
    wallet: WalletContextState,
    nonce: NonceResponse
  ): Promise<{ message: string; signature: string }> {
    if (!wallet.publicKey || !wallet.signMessage) {
      throw new Error('Wallet not connected or does not support message signing');
    }

    // Build SIWS message
    const message = this.buildSiwsMessage(
      wallet.publicKey.toBase58(),
      nonce
    );

    // Sign message
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = await wallet.signMessage(messageBytes);
    const signature = Buffer.from(signatureBytes).toString('base64');

    return { message, signature };
  }

  /**
   * Verify SIWS and get access token
   */
  async verifySiws(
    walletAddress: string,
    message: string,
    signature: string
  ): Promise<SiwsResponse> {
    const response = await fetch(`${this.apiUrl}/auth/siws`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet: walletAddress,
        message,
        signature,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `SIWS verification failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'SIWS verification failed');
    }

    return result.data;
  }

  /**
   * Complete SIWS flow
   */
  async completeSiwsFlow(wallet: WalletContextState): Promise<SiwsResponse> {
    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    const walletAddress = wallet.publicKey.toBase58();

    // 1. Get nonce
    const nonce = await this.getNonce(walletAddress);

    // 2. Sign message
    const { message, signature } = await this.signMessage(wallet, nonce);

    // 3. Verify and get token
    const result = await this.verifySiws(walletAddress, message, signature);

    return result;
  }

  /**
   * Build SIWS message according to spec
   */
  private buildSiwsMessage(walletAddress: string, nonce: NonceResponse): string {
    return [
      `Pokémon Summon Arena wants you to sign in with your Solana account:`,
      walletAddress,
      '',
      `URI: https://${nonce.domain}`,
      `Domain: ${nonce.domain}`,
      `Statement: ${nonce.statement}`,
      `Nonce: ${nonce.nonce}`,
      `Issued At: ${nonce.issuedAt}`,
      `Expiration Time: ${nonce.expirationTime}`,
      `Version: 1`
    ].join('\n');
  }
}

export const siwsClient = new SiwsClient();
export default siwsClient;
