import * as Phaser from "phaser";
import { socketManager } from "@/lib/socket/socket-manager";

interface LobbyUser {
  id: string;
  nickname: string;
  level: number;
  x: number;
  y: number;
}

export class LobbyScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private otherPlayers = new Map<string, Phaser.GameObjects.Container>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastMoveTime = 0;
  private readonly moveInterval = 50; // 20 moves per second max

  // UI elements
  private chatInput!: Phaser.GameObjects.DOMElement;
  private playerList!: Phaser.GameObjects.Text;
  private matchButton!: Phaser.GameObjects.Text;
  private isInQueue = false;

  // Scene destruction flag for cleanup
  private isDestroyed = false;

  constructor() {
    super({ key: "LobbyScene" });
  }

  create() {
    const { width, height } = this.scale;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a);

    // Title
    this.add
      .text(width / 2, 50, "Lobby - Move around and find matches!", {
        fontSize: "24px",
        color: "#fbbf24",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Create player
    this.createPlayer();

    // Create UI
    this.createUI();

    // Setup input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Setup socket listeners
    this.setupSocketListeners();

    // Join lobby
    socketManager.emit("lobby.join");

    console.log("✅ Lobby scene created");
  }

  update() {
    this.handleMovement();
  }

  private createPlayer() {
    const { width, height } = this.scale;

    // Create player sprite (simple colored rectangle for MVP)
    this.player = this.add.rectangle(width / 2, height / 2, 30, 30, 0x8b5cf6);
    this.player.setStrokeStyle(2, 0xfbbf24);

    // Add player label
    const user = this.registry.get("user");
    this.add
      .text(this.player.x, this.player.y - 25, user?.nickname || "Player", {
        fontSize: "14px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }

  private createUI() {
    const { width, height } = this.scale;

    // Player list background
    const listBg = this.add.rectangle(50, 150, 200, 300, 0x374151, 0.8);
    listBg.setOrigin(0, 0);

    // Player list title
    this.add.text(60, 160, "Online Players", {
      fontSize: "16px",
      color: "#fbbf24",
      fontStyle: "bold",
    });

    // Player list content
    this.playerList = this.add.text(60, 190, "", {
      fontSize: "12px",
      color: "#ffffff",
      wordWrap: { width: 180 },
    });

    // Match button
    this.matchButton = this.add
      .text(width / 2, height - 100, "Find Match", {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#059669",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive();

    this.matchButton.on("pointerdown", () => {
      this.handleMatchButton();
    });

    this.matchButton.on("pointerover", () => {
      this.matchButton.setStyle({ backgroundColor: "#047857" });
    });

    this.matchButton.on("pointerout", () => {
      const bgColor = this.isInQueue ? "#dc2626" : "#059669";
      this.matchButton.setStyle({ backgroundColor: bgColor });
    });

    // Chat input (simplified for MVP)
    this.add.text(60, height - 150, "Chat: Press T to type (coming soon)", {
      fontSize: "12px",
      color: "#9ca3af",
    });

    // Instructions
    this.add
      .text(width / 2, height - 50, "Use arrow keys to move around", {
        fontSize: "14px",
        color: "#6b7280",
      })
      .setOrigin(0.5);
  }

  private setupSocketListeners() {
    // Lobby events
    socketManager.on("lobby.snapshot", (data: unknown) => {
      if (!this.isDestroyed) {
        this.handleLobbySnapshot(
          data as {
            users: LobbyUser[];
            userPosition: { x: number; y: number };
          },
        );
      }
    });

    socketManager.on("lobby.update", (data: unknown) => {
      if (!this.isDestroyed) {
        this.handleLobbyUpdate(data as { users: LobbyUser[] });
      }
    });

    socketManager.on("lobby.position", (data: unknown) => {
      if (!this.isDestroyed) {
        this.handlePositionUpdate(
          data as { userId: string; x: number; y: number },
        );
      }
    });

    // Match events
    socketManager.on("match.found", (data: unknown) => {
      if (!this.isDestroyed) {
        this.handleMatchFound(
          data as {
            roomId: string;
            opponent: { id: string; nickname: string; level: number };
          },
        );
      }
    });

    socketManager.on("match.timeout", () => {
      if (!this.isDestroyed) {
        this.handleMatchTimeout();
      }
    });

    socketManager.on("match.queued", (data: unknown) => {
      if (!this.isDestroyed) {
        this.handleMatchQueued(
          data as { position: number; estimatedWait: number },
        );
      }
    });
  }

  private handleMovement() {
    const now = Date.now();
    if (now - this.lastMoveTime < this.moveInterval) {
      return;
    }

    let direction: string | null = null;

    if (this.cursors.left.isDown) {
      direction = "left";
    } else if (this.cursors.right.isDown) {
      direction = "right";
    } else if (this.cursors.up.isDown) {
      direction = "up";
    } else if (this.cursors.down.isDown) {
      direction = "down";
    }

    if (direction) {
      socketManager.emit("lobby.move", { direction });
      this.lastMoveTime = now;
    }
  }

  private handleLobbySnapshot(data: {
    users: LobbyUser[];
    userPosition: { x: number; y: number };
  }) {
    // Check if scene is still active and properly initialized
    if (
      this.isDestroyed ||
      !this.scene ||
      !this.scene.manager ||
      !this.scene.manager.isActive(this.scene.key)
    ) {
      console.warn(
        "Scene inactive or not initialized, skipping lobby snapshot update",
      );
      return;
    }

    // Update player position if player exists
    if (this.player) {
      this.player.setPosition(
        this.scale.width / 2 + data.userPosition.x,
        this.scale.height / 2 + data.userPosition.y,
      );
    }

    // Update other players
    this.updatePlayerList(data.users);
  }

  private handleLobbyUpdate(data: { users: LobbyUser[] }) {
    // Check if scene is still active and properly initialized
    if (
      this.isDestroyed ||
      !this.scene ||
      !this.scene.manager ||
      !this.scene.manager.isActive(this.scene.key)
    ) {
      console.warn("Scene inactive or not initialized, skipping lobby update");
      return;
    }

    this.updatePlayerList(data.users);
  }

  private handlePositionUpdate(data: { userId: string; x: number; y: number }) {
    // Check if scene is still active and properly initialized
    if (
      this.isDestroyed ||
      !this.scene ||
      !this.scene.manager ||
      !this.scene.manager.isActive(this.scene.key)
    ) {
      console.warn(
        "Scene inactive or not initialized, skipping position update",
      );
      return;
    }

    const user = this.registry.get("user");
    if (data.userId === user?.id) {
      // Update our player position if player exists
      if (this.player) {
        this.player.setPosition(
          this.scale.width / 2 + data.x,
          this.scale.height / 2 + data.y,
        );
      }
    } else {
      // Update other player position
      const otherPlayer = this.otherPlayers.get(data.userId);
      if (otherPlayer) {
        otherPlayer.setPosition(
          this.scale.width / 2 + data.x,
          this.scale.height / 2 + data.y,
        );
      }
    }
  }

  private updatePlayerList(users: LobbyUser[]) {
    // Check if playerList exists before updating
    if (!this.playerList) {
      console.warn("PlayerList not available, skipping update");
      return;
    }

    const user = this.registry.get("user");
    const currentUserId = user?.id;

    // Update player list text
    const playerTexts = users
      .filter((u) => u.id !== currentUserId)
      .map((u) => `${u.nickname} (Lv.${u.level})`)
      .slice(0, 15); // Limit display

    this.playerList.setText(playerTexts.join("\n"));

    // Update other player sprites
    this.clearOtherPlayers();

    users.forEach((u) => {
      if (u.id !== currentUserId) {
        this.createOtherPlayer(u);
      }
    });
  }

  private createOtherPlayer(user: LobbyUser) {
    const container = this.add.container(
      this.scale.width / 2 + user.x,
      this.scale.height / 2 + user.y,
    );

    // Player sprite
    const sprite = this.add.rectangle(0, 0, 25, 25, 0x10b981);
    sprite.setStrokeStyle(1, 0x6b7280);

    // Player name
    const nameText = this.add
      .text(0, -20, user.nickname, {
        fontSize: "12px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // Level badge
    const levelText = this.add
      .text(0, 20, `Lv.${user.level}`, {
        fontSize: "10px",
        color: "#fbbf24",
      })
      .setOrigin(0.5);

    container.add([sprite, nameText, levelText]);
    this.otherPlayers.set(user.id, container);
  }

  private clearOtherPlayers() {
    this.otherPlayers.forEach((container) => container.destroy());
    this.otherPlayers.clear();
  }

  private handleMatchButton() {
    if (this.isInQueue) {
      // Leave queue
      socketManager.emit("match.leave");
      this.isInQueue = false;
      this.matchButton.setText("Find Match");
      this.matchButton.setStyle({ backgroundColor: "#059669" });
    } else {
      // Join queue
      socketManager.emit("match.join");
      this.isInQueue = true;
      this.matchButton.setText("Cancel Match");
      this.matchButton.setStyle({ backgroundColor: "#dc2626" });
    }
  }

  private handleMatchFound(data: {
    roomId: string;
    opponent: { id: string; nickname: string; level: number };
  }) {
    console.log("✅ Match found:", data);

    // Check if scene is still active and properly initialized
    if (
      this.isDestroyed ||
      !this.scene ||
      !this.scene.manager ||
      !this.scene.manager.isActive(this.scene.key)
    ) {
      console.warn(
        "Scene inactive or not initialized, cannot start battle scene",
      );
      return;
    }

    // Store match data for battle scene
    this.registry.set("currentBattle", {
      roomId: data.roomId,
      opponent: data.opponent,
    });

    // Reset queue state before transitioning
    this.isInQueue = false;

    // Transition to battle scene
    try {
      this.scene.start("BattleScene");
    } catch (error) {
      console.error("Error starting battle scene:", error);
      // Fallback: try to reset the UI state
      if (this.matchButton) {
        this.matchButton.setText("Find Match");
        this.matchButton.setStyle({ backgroundColor: "#059669" });
      }
    }
  }

  private handleMatchTimeout() {
    console.log("⏰ Match timeout");

    // Check if scene is still active and matchButton exists
    if (
      this.isDestroyed ||
      !this.scene ||
      !this.scene.manager ||
      !this.scene.manager.isActive(this.scene.key) ||
      !this.matchButton
    ) {
      console.warn(
        "Scene inactive or matchButton not available, skipping timeout update",
      );
      return;
    }

    this.isInQueue = false;
    this.matchButton.setText("Find Match");
    this.matchButton.setStyle({ backgroundColor: "#059669" });
  }

  private handleMatchQueued(data: { position: number; estimatedWait: number }) {
    console.log("📝 Queued for match:", data);

    // Check if scene is still active and matchButton exists
    if (
      this.isDestroyed ||
      !this.scene ||
      !this.scene.manager ||
      !this.scene.manager.isActive(this.scene.key) ||
      !this.matchButton
    ) {
      console.warn(
        "Scene inactive or matchButton not available, skipping queue update",
      );
      return;
    }

    this.matchButton.setText(`In Queue (${data.position})`);
  }

  shutdown() {
    console.log("🧹 Shutting down LobbyScene");

    // Mark scene as destroyed to prevent further event handling
    this.isDestroyed = true;

    // If still in queue, leave it
    if (this.isInQueue) {
      socketManager.emit("match.leave");
      this.isInQueue = false;
    }

    // Cleanup socket listeners (remove all listeners for these events)
    socketManager.off("lobby.snapshot");
    socketManager.off("lobby.update");
    socketManager.off("lobby.position");
    socketManager.off("match.found");
    socketManager.off("match.timeout");
    socketManager.off("match.queued");

    // Clear other players
    this.clearOtherPlayers();
  }
}
