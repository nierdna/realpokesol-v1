export interface NonceRecord {
  wallet: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  used: boolean;
}

export interface NonceResponse {
  nonce: string;
  domain: string;
  statement: string;
  issuedAt: string;
  expirationTime: string;
}

export interface SiwsRequest {
  wallet: string;
  message: string;
  signature: string;
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
    } | null;
  };
}

export interface SessionRecord {
  userId: string;
  tokenId: string; // jti
  issuedAt: number;
  expiresAt: number;
}
