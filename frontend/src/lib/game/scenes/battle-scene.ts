import * as Phaser from 'phaser';
import { socketManager } from '@/lib/socket/socket-manager';
import { randomUUID } from 'crypto';

interface BattleState {
  p1: { id: string; hp: number; maxHp: number; level: number };
  p2: { id: string; hp: number; maxHp: number; level: number };
  currentTurnOwnerId: string;
  turnCount: number;
}

export class BattleScene extends Phaser.Scene {
  private player1Container!: Phaser.GameObjects.Container;
  private player2Container!: Phaser.GameObjects.Container;
  private player1HP!: Phaser.GameObjects.Graphics;
  private player2HP!: Phaser.GameObjects.Graphics;
  private actionButton!: Phaser.GameObjects.Text;
  private turnIndicator!: Phaser.GameObjects.Text;
  private battleLog!: Phaser.GameObjects.Text;
  
  private currentBattle: { roomId: string; opponent: { id: string; nickname: string; level: number } } | null = null;
  private battleState!: BattleState;
  private isMyTurn = false;
  private logLines: string[] = [];

  // Scene destruction flag for cleanup
  private isDestroyed = false;

  constructor() {
    super({ key: 'BattleScene' });
  }

  create() {
    const { width, height } = this.scale;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1e293b);

    // Get battle data
    this.currentBattle = this.registry.get('currentBattle');
    if (!this.currentBattle) {
      console.error('No battle data found');
      // Check if scene manager is available before transitioning
      if (this.scene && this.scene.manager) {
        try {
          this.scene.start('LobbyScene');
        } catch (error) {
          console.error('Error starting lobby scene:', error);
        }
      }
      return;
    }

    // Title
    this.add.text(width / 2, 50, 'Battle Arena', {
      fontSize: '32px',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Create battle UI
    this.createBattleUI();

    // Setup socket listeners
    this.setupSocketListeners();

    console.log('✅ Battle scene created');
  }

  private createBattleUI() {
    const { width, height } = this.scale;
    const user = this.registry.get('user');

    // Player 1 (Left side)
    this.player1Container = this.add.container(width * 0.25, height * 0.4);
    
    const p1Sprite = this.add.rectangle(0, 0, 80, 80, 0x8b5cf6);
    p1Sprite.setStrokeStyle(3, 0xfbbf24);
    
    const p1Name = this.add.text(0, 60, user?.nickname || 'Player 1', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.player1Container.add([p1Sprite, p1Name]);

    // Player 2 (Right side)
    this.player2Container = this.add.container(width * 0.75, height * 0.4);
    
    const p2Sprite = this.add.rectangle(0, 0, 80, 80, 0xef4444);
    p2Sprite.setStrokeStyle(3, 0x6b7280);
    
    const p2Name = this.add.text(0, 60, this.currentBattle?.opponent.nickname || 'Opponent', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.player2Container.add([p2Sprite, p2Name]);

    // HP bars
    this.createHPBars();

    // Turn indicator
    this.turnIndicator = this.add.text(width / 2, height * 0.15, 'Waiting for battle to start...', {
      fontSize: '20px',
      color: '#10b981',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Action button
    this.actionButton = this.add.text(width / 2, height * 0.8, 'Attack!', {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#dc2626',
      padding: { x: 30, y: 15 },
    }).setOrigin(0.5).setInteractive();

    this.actionButton.setVisible(false);

    this.actionButton.on('pointerdown', () => {
      this.performAttack();
    });

    this.actionButton.on('pointerover', () => {
      this.actionButton.setStyle({ backgroundColor: '#b91c1c' });
    });

    this.actionButton.on('pointerout', () => {
      this.actionButton.setStyle({ backgroundColor: '#dc2626' });
    });

    // Battle log
    this.battleLog = this.add.text(width / 2, height * 0.65, '', {
      fontSize: '14px',
      color: '#d1d5db',
      align: 'center',
      wordWrap: { width: width * 0.8 },
    }).setOrigin(0.5);

    // Back button
    const backButton = this.add.text(50, 50, '← Back to Lobby', {
      fontSize: '16px',
      color: '#8b5cf6',
      backgroundColor: '#374151',
      padding: { x: 15, y: 8 },
    }).setInteractive();

    backButton.on('pointerdown', () => {
      this.returnToLobby();
    });
  }

  private createHPBars() {
    const { width, height } = this.scale;

    // Player 1 HP bar
    this.add.text(width * 0.25, height * 0.25, 'HP:', {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.player1HP = this.add.graphics();

    // Player 2 HP bar  
    this.add.text(width * 0.75, height * 0.25, 'HP:', {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.player2HP = this.add.graphics();
  }

  private updateHPBars() {
    if (!this.battleState) return;

    const { width, height } = this.scale;
    const barWidth = 150;
    const barHeight = 20;

    // Clear previous bars
    this.player1HP.clear();
    this.player2HP.clear();

    // Player 1 HP
    const p1Percentage = this.battleState.p1.hp / this.battleState.p1.maxHp;
    this.player1HP.fillStyle(0x374151);
    this.player1HP.fillRect(width * 0.25 - barWidth/2, height * 0.28, barWidth, barHeight);
    this.player1HP.fillStyle(p1Percentage > 0.5 ? 0x10b981 : p1Percentage > 0.25 ? 0xf59e0b : 0xef4444);
    this.player1HP.fillRect(width * 0.25 - barWidth/2, height * 0.28, barWidth * p1Percentage, barHeight);

    // Player 2 HP
    const p2Percentage = this.battleState.p2.hp / this.battleState.p2.maxHp;
    this.player2HP.fillStyle(0x374151);
    this.player2HP.fillRect(width * 0.75 - barWidth/2, height * 0.28, barWidth, barHeight);
    this.player2HP.fillStyle(p2Percentage > 0.5 ? 0x10b981 : p2Percentage > 0.25 ? 0xf59e0b : 0xef4444);
    this.player2HP.fillRect(width * 0.75 - barWidth/2, height * 0.28, barWidth * p2Percentage, barHeight);

    // HP text
    this.add.text(width * 0.25, height * 0.31, `${this.battleState.p1.hp}/${this.battleState.p1.maxHp}`, {
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(width * 0.75, height * 0.31, `${this.battleState.p2.hp}/${this.battleState.p2.maxHp}`, {
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5);
  }

  private setupSocketListeners() {
    socketManager.on('battle.start', (data: unknown) => {
      if (!this.isDestroyed) {
        this.handleBattleStart(data as { roomId: string; battleState: BattleState });
      }
    });
    
    socketManager.on('battle.turn', (data: unknown) => {
      if (!this.isDestroyed) {
        this.handleBattleTurn(data as {
          damage: number;
          isCrit: boolean;
          targetHp: number;
          log: string;
          currentTurnOwnerId: string;
          nextTurnOwnerId: string;
        });
      }
    });
    
    socketManager.on('battle.end', (data: unknown) => {
      if (!this.isDestroyed) {
        this.handleBattleEnd(data as { winnerId: string; newLevels: { [userId: string]: number } });
      }
    });
  }

  private handleBattleStart(data: { roomId: string; battleState: BattleState }) {
    console.log('⚔️ Battle started:', data);
    
    this.battleState = data.battleState;
    this.updateHPBars();
    this.updateTurnIndicator();
    
    this.addLogLine('Battle started!');
  }

  private handleBattleTurn(data: {
    damage: number;
    isCrit: boolean;
    targetHp: number;
    log: string;
    currentTurnOwnerId: string;
    nextTurnOwnerId: string;
  }) {
    console.log('💥 Battle turn:', data);
    
    // Update battle state
    const user = this.registry.get('user');
    if (data.currentTurnOwnerId === user?.id) {
      this.battleState.p2.hp = data.targetHp;
    } else {
      this.battleState.p1.hp = data.targetHp;
    }
    
    this.battleState.currentTurnOwnerId = data.nextTurnOwnerId;
    this.battleState.turnCount++;

    // Update UI
    this.updateHPBars();
    this.updateTurnIndicator();
    this.addLogLine(data.log);
  }

  private handleBattleEnd(data: { winnerId: string; newLevels: { [userId: string]: number } }) {
    console.log('🏆 Battle ended:', data);
    
    // Check if scene is still active and properly initialized
    if (this.isDestroyed || !this.scene || !this.scene.manager || !this.scene.manager.isActive(this.scene.key)) {
      console.warn('Scene inactive or not initialized, skipping battle end handling');
      return;
    }

    const user = this.registry.get('user');
    const isWinner = data.winnerId === user?.id;
    
    this.addLogLine(isWinner ? 'You won!' : 'You lost!');
    
    if (this.actionButton) {
      this.actionButton.setVisible(false);
    }

    if (this.turnIndicator) {
      this.turnIndicator.setText(isWinner ? '🏆 Victory!' : '💀 Defeat!');
      this.turnIndicator.setStyle({ color: isWinner ? '#10b981' : '#ef4444' });
    }

    // Show return to lobby button after 3 seconds
    setTimeout(() => {
      if (this.scene && this.scene.manager && this.scene.manager.isActive(this.scene.key)) {
        this.returnToLobby();
      }
    }, 3000);
  }

  private handleMatchQueued(data: { position: number }) {
    console.log('📝 Match queued:', data);
  }

  private updateTurnIndicator() {
    // Check if scene is still active and UI elements exist
    if (this.isDestroyed || !this.scene || !this.scene.manager || !this.scene.manager.isActive(this.scene.key) || !this.turnIndicator || !this.actionButton) {
      console.warn('Scene inactive or UI elements not available, skipping turn indicator update');
      return;
    }

    const user = this.registry.get('user');
    this.isMyTurn = this.battleState.currentTurnOwnerId === user?.id;
    
    if (this.isMyTurn) {
      this.turnIndicator.setText('Your Turn!');
      this.turnIndicator.setStyle({ color: '#10b981' });
      this.actionButton.setVisible(true);
    } else {
      this.turnIndicator.setText("Opponent's Turn");
      this.turnIndicator.setStyle({ color: '#f59e0b' });
      this.actionButton.setVisible(false);
    }
  }

  private performAttack() {
    if (!this.isMyTurn) return;

    const requestId = randomUUID();
    socketManager.emit('battle.action', {
      action: 'attack',
      requestId,
    });

    // Disable button temporarily
    this.actionButton.setVisible(false);
  }

  private addLogLine(line: string) {
    // Check if battleLog exists before updating
    if (!this.battleLog) {
      console.warn('BattleLog not available, skipping log update');
      return;
    }

    this.logLines.push(line);
    if (this.logLines.length > 5) {
      this.logLines.shift();
    }
    this.battleLog.setText(this.logLines.join('\n'));
  }

  private returnToLobby() {
    // Emit lobby join to refresh state
    socketManager.emit('lobby.join');
    
    // Transition back to lobby
    this.scene.start('LobbyScene');
  }

  shutdown() {
    console.log('🧹 Shutting down BattleScene');

    // Mark scene as destroyed to prevent further event handling
    this.isDestroyed = true;

    // Cleanup socket listeners
    socketManager.off('battle.start');
    socketManager.off('battle.turn');
    socketManager.off('battle.end');
  }

}
