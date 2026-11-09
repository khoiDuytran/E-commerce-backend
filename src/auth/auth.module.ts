import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { UsersModule } from '../modules/users/users.module.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './passport/local.strategy.js';
import { JwtStrategy } from './passport/jwt.strategy.js';
import { RefreshTokensModule } from '../modules/refresh-tokens/refresh-tokens.module.js';
import { parseDurationToMs } from '../helpers/utils.js';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  DEFAULT_AUTH_THROTTLE,
  THROTTLE_ERROR_MESSAGE,
} from './auth-throttle.js';

@Module({
  imports: [
    UsersModule,
    // Bộ đếm lưu trong bộ nhớ: đủ khi chạy 1 instance, chạy nhiều instance cần storage Redis
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ...DEFAULT_AUTH_THROTTLE }],
      errorMessage: THROTTLE_ERROR_MESSAGE,
    }),
    RefreshTokensModule,
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        global: true,
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          // expiresIn dạng số được tính bằng giây
          expiresIn: Math.floor(
            parseDurationToMs(
              configService.get<string>('JWT_ACCESS_TOKEN_EXPIRED', '30m'),
            ) / 1000,
          ),
        },
      }),
      inject: [ConfigService],
    }),
    PassportModule.register({ defaultStrategy: 'local' }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
})
export class AuthModule {}
