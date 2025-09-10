import * as Phaser from 'phaser';
import { socketManager } from '@/lib/socket/socket-manager';

export class LoadingScene extends Phaser.Scene {
  private loadingText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'LoadingScene' });
  }

  preload() {
    // Create loading UI
    this.createLoadingUI();

    // Load any assets here if needed
    // For MVP, we'll use simple colored rectangles and text
    
    // Update loading progress
    this.load.on('progress', (value: number) => {
      this.updateProgress(value);
    });

    this.load.on('complete', () => {
      this.loadingText.setText('Connecting to server...');
      this.connectToServer();
    });

    // Start loading (even if no assets, this will trigger complete)
    if (this.load.totalToLoad === 0) {
      this.load.image('dummy', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
    }
  }

  create() {
    // Scene created, loading will start automatically
  }

  private createLoadingUI() {
    const { width, height } = this.scale;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a1a);

    // Title
    this.add.text(width / 2, height / 2 - 100, 'Pokémon Summon Arena', {
      fontSize: '48px',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Loading text
    this.loadingText = this.add.text(width / 2, height / 2 + 50, 'Loading...', {
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Progress bar background
    this.progressBox = this.add.graphics();
    this.progressBox.fillStyle(0x222222);
    this.progressBox.fillRect(width / 2 - 160, height / 2 + 100, 320, 20);

    // Progress bar
    this.progressBar = this.add.graphics();
  }

  private updateProgress(value: number) {
    const { width, height } = this.scale;
    
    this.progressBar.clear();
    this.progressBar.fillStyle(0x8b5cf6);
    this.progressBar.fillRect(width / 2 - 158, height / 2 + 102, 316 * value, 16);
  }

  private async connectToServer() {
    try {
      // Check if socket is already connected
      if (socketManager.isConnected) {
        this.onConnectionSuccess();
        return;
      }

      // Setup connection listeners
      socketManager.on('connected', () => this.onConnectionSuccess());
      socketManager.on('connect_error', (error: unknown) => this.onConnectionError(error));
      socketManager.on('disconnect', (reason: unknown) => this.onDisconnect(reason as string));

      // Connect if not already connected
      if (!socketManager.isConnected) {
        socketManager.connect();
      }

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!socketManager.isConnected) {
          this.onConnectionError({ message: 'Connection timeout' });
        }
      }, 10000);

    } catch (error) {
      console.error('Connection setup error:', error);
      this.onConnectionError(error);
    }
  }

  private onConnectionSuccess() {
    console.log('✅ Connected to server successfully');
    
    // Cleanup listeners
    socketManager.off('connected');
    socketManager.off('connect_error');
    socketManager.off('disconnect');

    // Notify game loaded
    const onGameLoaded = this.registry.get('onGameLoaded');
    if (onGameLoaded) {
      onGameLoaded();
    }

    // Transition to lobby
    this.scene.start('LobbyScene');
  }

  private onConnectionError(error: unknown) {
    console.error('🔥 Connection error:', error);
    
    this.loadingText.setText('Connection failed!');
    this.loadingText.setColor('#ef4444');

    // Add retry button
    const { width, height } = this.scale;
    const retryButton = this.add.text(width / 2, height / 2 + 150, 'Retry Connection', {
      fontSize: '20px',
      color: '#8b5cf6',
      backgroundColor: '#374151',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive();

    retryButton.on('pointerdown', () => {
      retryButton.destroy();
      this.loadingText.setText('Connecting to server...');
      this.loadingText.setColor('#ffffff');
      this.connectToServer();
    });

    retryButton.on('pointerover', () => {
      retryButton.setStyle({ backgroundColor: '#4b5563' });
    });

    retryButton.on('pointerout', () => {
      retryButton.setStyle({ backgroundColor: '#374151' });
    });
  }

  private onDisconnect(reason: string) {
    console.log('❌ Disconnected:', reason);
    
    if (reason !== 'io client disconnect') {
      // Auto-reconnect unless manually disconnected
      this.loadingText.setText('Reconnecting...');
      setTimeout(() => this.connectToServer(), 2000);
    }
  }
}
