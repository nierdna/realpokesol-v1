"use client";

import { useEffect, useRef, MutableRefObject } from "react";
import * as Phaser from "phaser";
import { LoadingScene } from "@/lib/game/scenes/loading-scene";
import { LobbyScene } from "@/lib/game/scenes/lobby-scene";
import { BattleScene } from "@/lib/game/scenes/battle-scene";

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

interface PhaserGameProps {
  onGameLoaded: () => void;
  user: User;
  gameRef: MutableRefObject<Phaser.Game | null>;
}

export function PhaserGame({ onGameLoaded, user, gameRef }: PhaserGameProps) {
  const gameContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gameContainerRef.current || gameRef.current) {
      return;
    }

    // Phaser game configuration
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: typeof window !== "undefined" ? window.innerWidth : 800,
      height: typeof window !== "undefined" ? window.innerHeight : 600,
      parent: gameContainerRef.current,
      backgroundColor: "#1a1a1a",
      scene: [LoadingScene, LobbyScene, BattleScene],
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: process.env.NODE_ENV === "development",
        },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        keyboard: true,
      },
    };

    // Create game instance
    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Pass user data to scenes
    game.registry.set("user", user);
    game.registry.set("onGameLoaded", onGameLoaded);

    // Handle window resize
    const handleResize = () => {
      if (game && game.scale && typeof window !== "undefined") {
        game.scale.resize(window.innerWidth, window.innerHeight);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
    }

    // Cleanup on unmount
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", handleResize);
      }
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [user, onGameLoaded, gameRef]);

  return (
    <div
      ref={gameContainerRef}
      className="w-full h-full"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
