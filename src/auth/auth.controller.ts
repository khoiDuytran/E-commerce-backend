import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Response,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  CookieOptions,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { AuthService } from './auth.service.js';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import { LocalAuthGuard } from './passport/local-auth.guard.js';
import { Public, ResponseMessage } from '../decorator/customize.js';
import { ConfigService } from '@nestjs/config';
import { RefreshTokensService } from '../modules/refresh-tokens/refresh-tokens.service.js';
import { CodeAuthDto } from './dto/code-auth.dto.js';
import { ChangePasswordAuthDto } from './dto/change-password.dto.js';
import { EmailAuthDto } from './dto/email-auth.dto.js';
import { RestoreAccountDto } from '../modules/users/dto/account-status.dto.js';
import { parseDurationToMs } from '../helpers/utils.js';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  LoginThrottle,
  RegisterThrottle,
  SendMailThrottle,
  VerifyCodeThrottle,
} from './auth-throttle.js';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Guard cấp class chạy trước LocalAuthGuard của login, nên lần đăng nhập sai (401) vẫn bị đếm
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly refreshTokenService: RefreshTokensService,
  ) { }

  private refreshCookieOptions(): CookieOptions {
    const secure = this.configService.get<string>('NODE_ENV') === 'production';
    const refreshExpire = this.configService.get<string>(
      'JWT_REFRESH_TOKEN_EXPIRE',
      '7d',
    );
    return {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: parseDurationToMs(refreshExpire),
    };
  }

  @Post('login')
  @LoginThrottle()
  @UseGuards(LocalAuthGuard)
  @Public()
  @ResponseMessage('Login success')
  async login(
    @Request() req: ExpressRequest & { user: any },
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.login(req.user);
    const refreshToken = await this.refreshTokenService.generateRefreshToken(
      req.user._id.toString(),
    );
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, this.refreshCookieOptions());
    return result;
  }

  // refresh/logout do server Next gọi (chung IP) và đã cần refresh token hợp lệ
  @Post('refresh')
  @SkipThrottle()
  @Public()
  async refresh(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const oldToken = req.cookies?.refresh_token;
    if (!oldToken) {
      throw new UnauthorizedException('Refresh token không tồn tại.');
    }
    const { token: refreshToken, userId } =
      await this.refreshTokenService.rotateRefreshToken(oldToken);
    const accessToken = await this.authService.refreshAccessToken(
      userId.toString(),
    );
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, this.refreshCookieOptions());
    return { access_token: accessToken };
  }

  @Post('logout')
  @SkipThrottle()
  @Public()
  async logout(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      await this.refreshTokenService.revokeRefreshToken(refreshToken);
    }
    res.clearCookie('refresh_token', this.refreshCookieOptions());
    return { message: 'Đăng xuất thành công.' };
  }

  @Post('register')
  @RegisterThrottle()
  @Public()
  register(@Body() createAuthDto: CreateAuthDto) {
    return this.authService.register(createAuthDto);
  }

  @Post('check-code')
  @VerifyCodeThrottle()
  @Public()
  checkCode(@Body() codeAuthDto: CodeAuthDto) {
    return this.authService.checkCode(codeAuthDto);
  }

  @Post('retry-active')
  @SendMailThrottle()
  @Public()
  retryActive(@Body() { email }: EmailAuthDto) {
    return this.authService.retryActive(email);
  }

  @Post('retry-password')
  @SendMailThrottle()
  @Public()
  retryPassword(@Body() { email }: EmailAuthDto) {
    return this.authService.retryPassword(email);
  }

  @Post('restore/code')
  @SendMailThrottle()
  @Public()
  requestRestoreCode(@Body() { email }: EmailAuthDto) {
    return this.authService.requestRestoreCode(email);
  }

  @Post('restore')
  @VerifyCodeThrottle()
  @Public()
  restoreAccount(@Body() { email, code }: RestoreAccountDto) {
    return this.authService.restoreAccount(email, code);
  }

  @Post('change-password')
  @VerifyCodeThrottle()
  @Public()
  changePassword(@Body() data: ChangePasswordAuthDto) {
    return this.authService.changePassword(data);
  }
}
