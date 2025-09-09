'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { simpleAuthClient } from './simple-auth-client';
import { socketManager } from '../socket/socket-manager';

interface User {
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
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!user && !!accessToken;

  /**
   * Sign in with Solana wallet
   */
  const signIn = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Complete simple auth flow
      const result = await simpleAuthClient.completeAuthFlow(wallet);
      
      // Store auth data
      setAccessToken(result.accessToken);
      setUser(result.user);
      
      // Store in localStorage for persistence
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('user', JSON.stringify(result.user));

      // Create socket connection
      socketManager.create(result.accessToken);
      socketManager.connect();

      console.log('✅ Authentication successful:', result.user.nickname);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      console.error('🔥 Authentication error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Sign out and cleanup
   */
  const signOut = () => {
    // Disconnect socket
    socketManager.disconnect();
    socketManager.destroy();

    // Clear auth state
    setUser(null);
    setAccessToken(null);
    setError(null);

    // Clear localStorage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');

    console.log('✅ Signed out successfully');
  };

  /**
   * Try to restore session from localStorage
   */
  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setAccessToken(storedToken);
        setUser(parsedUser);

        // Try to reconnect socket
        socketManager.create(storedToken);
        socketManager.connect();

        console.log('✅ Session restored:', parsedUser.nickname);
      } catch (err) {
        console.error('🔥 Session restoration failed:', err);
        signOut();
      }
    }
  }, []);

  /**
   * Clear auth when wallet disconnects
   */
  useEffect(() => {
    if (!wallet.connected && isAuthenticated) {
      signOut();
    }
  }, [wallet.connected, isAuthenticated]);

  const value: AuthContextType = {
    user,
    accessToken,
    isAuthenticated,
    isLoading,
    error,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthProvider;
