'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';

// Dynamically import PhaserGame to avoid SSR issues
const PhaserGame = dynamic(
  () => import('./phaser-game').then(mod => ({ default: mod.PhaserGame })),
  { 
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-xl text-purple-400 font-semibold">Loading Game Engine...</p>
        </div>
      </div>
    )
  }
);

export default function GameClient() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const gameRef = useRef<Phaser.Game | null>(null);
  const [gameLoaded, setGameLoaded] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Game UI Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-gray-800/80 backdrop-blur-sm rounded-lg p-4">
        <div className="text-sm">
          <p className="font-semibold text-yellow-400">{user.nickname}</p>
          <p className="text-gray-300">Level {user.creature.level}</p>
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">HP:</span>
              <div className="bg-gray-700 rounded-full h-2 w-20 overflow-hidden">
                <div 
                  className="bg-green-500 h-full transition-all duration-300"
                  style={{ 
                    width: `${(user.creature.hp / user.creature.maxHp) * 100}%` 
                  }}
                />
              </div>
              <span className="text-xs text-gray-300">
                {user.creature.hp}/{user.creature.maxHp}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Back to Home Button */}
      <button
        onClick={() => router.push('/')}
        className="absolute top-4 right-4 z-10 bg-gray-800/80 backdrop-blur-sm hover:bg-gray-700/80 px-4 py-2 rounded-lg text-sm transition-colors"
      >
        ← Back to Home
      </button>

      {/* Phaser Game Canvas */}
      <PhaserGame 
        onGameLoaded={() => setGameLoaded(true)}
        user={user}
        gameRef={gameRef}
      />

      {/* Loading Overlay */}
      {!gameLoaded && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-xl text-purple-400 font-semibold">Loading Arena...</p>
            <p className="text-gray-500 mt-2">Preparing your Pokémon adventure</p>
          </div>
        </div>
      )}
    </div>
  );
}
