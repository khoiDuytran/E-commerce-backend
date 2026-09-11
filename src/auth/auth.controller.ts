import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Response,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { AuthService } from './auth.service.js';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import { LocalAuthGuard } from './passport/local-auth.guard.js';
import { Public, ResponseMessage } from '../decorator/customize.js';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { RefreshTokensService } from '../models/refresh-tokens/refresh-tokens.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly refreshTokenService: RefreshTokensService,
  ) {}

  private refreshCookieOptions() {
    const secure = this.configService.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure,
      sameSite: secure ? ('none' as const) : ('lax' as const),
      path: '/api/auth',
    };
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @Public()
  @ResponseMessage('Fetch login')
  async login(
    @Request() req: ExpressRequest & { user: any },
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.login(req.user);
    const refreshToken = await this.refreshTokenService.generateRefreshToken(
      req.user._id.toString(),
    );
    res.cookie('refresh_token', refreshToken, this.refreshCookieOptions());
    return result;
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const oldToken = req.cookies?.refresh_token;
    if (!oldToken) {
      throw new UnauthorizedException('Refresh token không tồn tại.');
    }
    const session =
      await this.refreshTokenService.validateRefreshToken(oldToken);
    const refreshToken =
      await this.refreshTokenService.rotateRefreshToken(oldToken);
    const accessToken = await this.authService.refreshAccessToken(
      session.userId.toString(),
    );
    res.cookie('refresh_token', refreshToken, this.refreshCookieOptions());
    return { access_token: accessToken };
  }

  @Post('logout')
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
  @Public()
  register(@Body() createAuthDto: CreateAuthDto) {
    return this.authService.register(createAuthDto);
  }

  @Get('mail')
  @Public()
  testMail() {
    this.mailerService.sendMail({
      to: 'khoitranduy9404@gmail.com',
      subject: 'Welcome!',
      template: 'register.hbs',
      context: { name: 'tranduykhoi', activationCode: '123456' },
    });
    return 'ok';
  }
}
