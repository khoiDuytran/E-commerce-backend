import { Body, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  CreateAuthDto,
  IUserPayload,
  LoginAuthDto,
} from './dto/create-auth.dto.js';
import { UpdateAuthDto } from './dto/update-auth.dto.js';
import { UsersService } from '../models/users/users.service.js';
import { JwtService } from '@nestjs/jwt';
import { comparePasswordHelper } from '../helpers/utils.js';

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

  async register(createAuthDto: CreateAuthDto) {
    return await this.usersService.register(createAuthDto);
  }

  findAll() {
    return `This action returns all auth`;
  }

  findOne(id: number) {
    return `This action returns a #${id} auth`;
  }

  update(id: number, updateAuthDto: UpdateAuthDto) {
    return `This action updates a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }
}
