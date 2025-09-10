import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SiwsDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  /**
   * Test endpoint
   */
  @Get('test')
  test() {
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
  getNonce(@Query('wallet') wallet: string) {
    try {
      if (!wallet) {
        throw new HttpException(
          'Wallet address is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Nonce requested for wallet: ${wallet}`);
      const result = this.authService.generateNonce(wallet);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`Nonce generation error: ${error?.message || error}`);
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
   * Verify simple auth signature
   * POST /auth/verify
   */
  @Post('verify')
  async verifyAuth(@Body() siwsDto: SiwsDto) {
    try {
      this.logger.log(
        `Simple auth verification requested for wallet: ${siwsDto.wallet}`,
      );

      const result = await this.authService.verifySiws({
        wallet: siwsDto.wallet,
        message: siwsDto.message,
        signature: siwsDto.signature,
      });

      this.logger.log(
        `Simple auth verification successful for wallet: ${siwsDto.wallet}`,
      );
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `Simple auth verification error: ${error?.message || error}`,
      );
      throw new HttpException(
        {
          success: false,
          error: 'AUTH_VERIFICATION_FAILED',
          message:
            error?.message || 'Failed to verify authentication signature',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Get authentication stats (for monitoring)
   * GET /auth/stats
   */
  @Get('stats')
  getStats() {
    try {
      const stats = this.authService.getStats();
      return {
        success: true,
        data: stats,
      };
    } catch (error: any) {
      this.logger.error(`Stats retrieval error: ${error?.message || error}`);
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
