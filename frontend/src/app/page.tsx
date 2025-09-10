"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/lib/auth/auth-context";
import { WalletButton, WalletInfo } from "@/components/wallet/wallet-button";
import Link from "next/link";

export default function Home() {
  const { connected } = useWallet();
  const { user, isAuthenticated, isLoading, error, signIn } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 bg-clip-text text-transparent mb-4">
            Pokémon Summon Arena
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            PvP turn-based 2D battles with Solana authentication
          </p>
        </div>

        {/* Main Content */}
        <div className="max-w-2xl mx-auto">
          {!connected ? (
            /* Wallet Connection */
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 text-center">
              <h2 className="text-2xl font-semibold mb-4">
                Connect Your Wallet
              </h2>
              <p className="text-gray-400 mb-8">
                Connect your Solana wallet to start playing
              </p>
              <WalletButton />
            </div>
          ) : !isAuthenticated ? (
            /* Authentication */
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 text-center">
              <h2 className="text-2xl font-semibold mb-4">Sign In</h2>
              <WalletInfo />
              <p className="text-gray-400 mb-8 mt-4">
                Sign a message to authenticate with your wallet
              </p>

              {error && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-4">
                  <p className="text-red-400">{error}</p>
                </div>
              )}

              <button
                onClick={signIn}
                disabled={isLoading}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-semibold transition-colors"
              >
                {isLoading ? "Signing In..." : "Sign In with Solana"}
              </button>
            </div>
          ) : (
            /* Authenticated - Game Entry */
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 text-center">
              <h2 className="text-2xl font-semibold mb-4">
                Welcome, {user?.nickname}!
              </h2>

              <div className="bg-gray-700/50 rounded-lg p-6 mb-8">
                <h3 className="text-lg font-medium mb-4">Your Creature</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Name:</span>
                    <p className="font-medium">{user?.creature.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Level:</span>
                    <p className="font-medium">{user?.creature.level}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">HP:</span>
                    <p className="font-medium">
                      {user?.creature.hp}/{user?.creature.maxHp}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Status:</span>
                    <p className="font-medium">
                      {user?.creature.isFainted ? "😵 Fainted" : "💪 Ready"}
                    </p>
                  </div>
                </div>
              </div>

              <Link
                href="/game"
                className="bg-green-600 hover:bg-green-700 px-8 py-4 rounded-lg font-bold text-lg transition-colors inline-block"
              >
                🎮 Enter Arena
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-gray-500">
          <p>Built with Next.js 15, Phaser 3, NestJS & Solana</p>
        </div>
      </div>
    </div>
  );
}
