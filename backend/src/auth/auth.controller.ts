import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpException,
  HttpStatus,
  Logger,
  Headers,
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
    } catch (error) {
      this.logger.error(
        `Nonce generation error: ${error instanceof Error ? error.message : String(error)}`,
      );
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
   * Verify SIWS signature (SRS specification compliant)
   * POST /auth/siws
   */
  @Post('siws')
  async verifySiws(@Body() siwsDto: SiwsDto) {
    try {
      this.logger.log(
        `SIWS verification requested for wallet: ${siwsDto.wallet}`,
      );

      const result = await this.authService.verifySiws({
        wallet: siwsDto.wallet,
        message: siwsDto.message,
        signature: siwsDto.signature,
      });

      this.logger.log(
        `SIWS verification successful for wallet: ${siwsDto.wallet}`,
      );
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `SIWS verification error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException(
        {
          success: false,
          error: 'SIWS_VERIFICATION_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to verify SIWS signature',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Verify simple auth signature (backward compatibility)
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
    } catch (error) {
      this.logger.error(
        `Simple auth verification error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException(
        {
          success: false,
          error: 'AUTH_VERIFICATION_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to verify authentication signature',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Validate existing JWT token
   * GET /auth/validate
   */
  @Get('validate')
  async validateToken(@Headers('authorization') authorization?: string) {
    try {
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new HttpException(
          {
            success: false,
            error: 'NO_TOKEN',
            message: 'Authorization token required',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const token = authorization.replace('Bearer ', '');
      const user = await this.authService.verifyToken(token);

      if (!user) {
        throw new HttpException(
          {
            success: false,
            error: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.logger.log(`Token validation successful for user: ${user.id}`);
      return {
        success: true,
        data: {
          valid: true,
          user,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Token validation error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException(
        {
          success: false,
          error: 'TOKEN_VALIDATION_FAILED',
          message: 'Invalid token',
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
    } catch (error) {
      this.logger.error(
        `Stats retrieval error: ${error instanceof Error ? error.message : String(error)}`,
      );
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
