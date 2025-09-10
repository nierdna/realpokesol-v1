import { io, Socket } from "socket.io-client";

class SocketManager {
  private socket?: Socket;
  private token?: string;

  /**
   * Create socket instance with token
   */
  create(token: string): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    this.token = token;
    this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ["websocket"],
      auth: { token },
    });

    // Setup default event listeners
    this.setupDefaultListeners();

    return this.socket;
  }

  /**
   * Update token for existing socket
   */
  setToken(token: string): void {
    this.token = token;
    if (this.socket) {
      this.socket.auth = { token };
    }
  }

  /**
   * Connect to server
   */
  connect(): void {
    if (this.socket && !this.socket.connected) {
      this.socket.connect();
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  /**
   * Add event listener
   */
  on(event: string, callback: (...args: unknown[]) => void): void {
    this.socket?.on(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback?: (...args: unknown[]) => void): void {
    this.socket?.off(event, callback);
  }

  /**
   * Emit event to server
   */
  emit(event: string, data?: unknown): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`Socket not connected, cannot emit: ${event}`);
    }
  }

  /**
   * Get current socket instance
   */
  get current(): Socket | undefined {
    return this.socket;
  }

  /**
   * Check if socket is connected
   */
  get isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Setup default event listeners
   */
  private setupDefaultListeners(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("✅ Socket connected:", this.socket!.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("🔥 Socket connection error:", error);
    });

    this.socket.on("error", (error) => {
      console.error("🔥 Socket error:", error);
    });

    this.socket.on("replaced", (data) => {
      console.log("🔄 Session replaced:", data.message);
      // Handle session replacement (user opened new tab)
    });

    this.socket.on("connected", (data) => {
      console.log("✅ Authentication successful:", data);
    });
  }

  /**
   * Cleanup and destroy socket
   */
  destroy(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = undefined;
    }
    this.token = undefined;
  }
}

// Export singleton instance
export const socketManager = new SocketManager();
export default socketManager;
