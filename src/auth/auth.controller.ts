import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import { LocalAuthGuard } from './passport/local-auth.guard.js';
import { Public, ResponseMessage } from '../decorator/customize.js';
import { MailerService } from '@nestjs-modules/mailer';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mailerService: MailerService,
  ) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @Public()
  @ResponseMessage('Fetch login')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @UseGuards(LocalAuthGuard)
  @Post('auth/logout')
  @Public()
  async logout(@Request() req: any) {
    return req.logout();
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
