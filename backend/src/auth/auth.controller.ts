import { 
  Controller, 
  Get, 
  Post, 
  Query, 
  Body, 
  HttpException, 
  HttpStatus,
  Logger 
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  /**
   * Test endpoint
   */
  @Get('test')
  async test() {
    return {
      success: true,
      message: 'Auth module working!',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate nonce for SIWS
   * GET /auth/nonce?wallet=<base58>
   */
  @Get('nonce')
  async getNonce(@Query('wallet') wallet: string) {
    try {
      if (!wallet) {
        throw new HttpException('Wallet address is required', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`Nonce requested for wallet: ${wallet}`);
      const result = this.authService.generateNonce(wallet);
      
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Nonce generation error: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: 'NONCE_GENERATION_FAILED',
          message: 'Failed to generate nonce',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get authentication stats (for monitoring)
   * GET /auth/stats
   */
  @Get('stats')
  async getStats() {
    try {
      const stats = this.authService.getStats();
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`Stats retrieval error: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: 'STATS_RETRIEVAL_FAILED',
          message: 'Failed to retrieve stats',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}