import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateAuthDto, IUserPayload } from './dto/create-auth.dto.js';
import { UsersService } from '../models/users/users.service.js';
import { JwtService } from '@nestjs/jwt';
import { comparePasswordHelper } from '../helpers/utils.js';
import { CodeAuthDto } from './dto/code-auth.dto.js';
import { ChangePasswordAuthDto } from './dto/change-password.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Username/Password không hợp lệ.');
    }
    const isValidPassword = await comparePasswordHelper(
      password,
      user.password,
    );
    if (!isValidPassword) {
      throw new UnauthorizedException('Username/Password không hợp lệ.');
    }

    return user;
  }

  async login(user: IUserPayload) {
    const payload = { username: user.email, sub: user._id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        email: user.email,
        _id: user._id,
        name: user.name,
      },
    };
  }

  async checkCode(codeAuthDto: CodeAuthDto) {
    return await this.usersService.handleActive(codeAuthDto);
  }

  async retryActive(data: string) {
    return await this.usersService.retryActive(data);
  }

  async retryPassword(data: string) {
    return await this.usersService.retryPassword(data);
  }

  async changePassword(data: ChangePasswordAuthDto) {
    return await this.usersService.changePassword(data);
  }

  async refreshAccessToken(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại.');
    }

    const payload = { username: user.email, sub: user._id };
    return this.jwtService.sign(payload);
  }

  async register(createAuthDto: CreateAuthDto) {
    return await this.usersService.register(createAuthDto);
  }
}
