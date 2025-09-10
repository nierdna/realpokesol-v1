import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class SocketAuthGuard implements CanActivate {
  private readonly logger = new Logger(SocketAuthGuard.name);

  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();

    try {
      // Get token from auth object or headers
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`No token provided for socket: ${client.id}`);
        client.emit('error', {
          code: 'NO_TOKEN',
          message: 'Authentication token required',
        });
        client.disconnect();
        return false;
      }

      // Verify token and get user
      const user = await this.authService.verifyToken(token);
      if (!user) {
        this.logger.warn(`Invalid token for socket: ${client.id}`);
        client.emit('error', {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
        });
        client.disconnect();
        return false;
      }

      // Store user data in socket
      client.data.userId = user.id;
      client.data.user = user;

      this.logger.log(
        `Socket authenticated: ${client.id} -> ${user.nickname} (${user.id})`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Socket authentication error: ${error.message}`);
      client.emit('error', {
        code: 'AUTH_ERROR',
        message: 'Authentication failed',
      });
      client.disconnect();
      return false;
    }
  }
}
