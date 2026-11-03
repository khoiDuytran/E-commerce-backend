import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<any> {
    // Route login đi qua guard trước ValidationPipe nên phải tự chặn object ở đây
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }
    if (!user.isActive) {
      // Frontend dựa vào mã 400 để phân biệt với sai mật khẩu và mở modal kích hoạt
      throw new BadRequestException('Tài khoản chưa được kích hoạt');
    }
    return user;
  }
}
