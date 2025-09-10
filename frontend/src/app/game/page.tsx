"use client";

import dynamic from "next/dynamic";

// Dynamically import GameClient to avoid SSR issues with Phaser
const GameClient = dynamic(() => import("@/components/game/game-client"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <p className="text-xl text-purple-400 font-semibold">Loading Game...</p>
      </div>
    </div>
  ),
});

export default function GamePage() {
  return <GameClient />;
}
