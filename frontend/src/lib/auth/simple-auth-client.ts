import { WalletContextState } from '@solana/wallet-adapter-react';

export interface ChallengeResponse {
  nonce: string;
  domain: string;
  statement: string;
  message: string;
  issuedAt: string;
  expirationTime: string;
}

export interface AuthResponse {
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

export class SimpleAuthClient {
  private readonly apiUrl: string;

  constructor() {
    this.apiUrl = process.env.NEXT_PUBLIC_API_URL!;
  }

  /**
   * Get challenge for wallet
   */
  async getChallenge(walletAddress: string): Promise<ChallengeResponse> {
    const response = await fetch(
      `${this.apiUrl}/auth/nonce?wallet=${encodeURIComponent(walletAddress)}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get challenge: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to get challenge');
    }

    return result.data;
  }

  /**
   * Sign simple message with wallet
   */
  async signMessage(
    wallet: WalletContextState,
    challenge: ChallengeResponse
  ): Promise<{ message: string; signature: string }> {
    if (!wallet.publicKey || !wallet.signMessage) {
      throw new Error('Wallet not connected or does not support message signing');
    }

    const message = challenge.message;

    // Sign message
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = await wallet.signMessage(messageBytes);
    const signature = Buffer.from(signatureBytes).toString('base64');

    return { message, signature };
  }

  /**
   * Verify auth and get access token
   */
  async verifyAuth(
    walletAddress: string,
    message: string,
    signature: string
  ): Promise<AuthResponse> {
    const response = await fetch(`${this.apiUrl}/auth/verify`, {
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
      throw new Error(error.message || `Auth verification failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Auth verification failed');
    }

    return result.data;
  }

  /**
   * Complete simple auth flow
   */
  async completeAuthFlow(wallet: WalletContextState): Promise<AuthResponse> {
    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    const walletAddress = wallet.publicKey.toBase58();

    // 1. Get challenge
    const challenge = await this.getChallenge(walletAddress);

    // 2. Sign message
    const { message, signature } = await this.signMessage(wallet, challenge);

    // 3. Verify and get token
    const result = await this.verifyAuth(walletAddress, message, signature);

    return result;
  }
}

export const simpleAuthClient = new SimpleAuthClient();
export default simpleAuthClient;
