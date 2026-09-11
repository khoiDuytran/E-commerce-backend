import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema.js';
import ms, { StringValue } from 'ms';

@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    private configService: ConfigService,
  ) {}

  async generateRefreshToken(userId: string): Promise<string> {
    const token = uuidv4();
    const expiresInMs = ms(
      this.configService.get<string>(
        'JWT_REFRESH_TOKEN_EXPIRE',
        '7d',
      ) as StringValue,
    );
    const expiresAt = new Date(Date.now() + expiresInMs);

    await this.refreshTokenModel.create({
      token,
      userId: new Types.ObjectId(userId),
      expiresAt,
    });

    return token;
  }

  async validateRefreshToken(token: string): Promise<RefreshTokenDocument> {
    const found = await this.refreshTokenModel.findOne({
      token,
      isRevoked: false,
    });

    if (!found) {
      throw new UnauthorizedException('Refresh token không hợp lệ.');
    }

    if (found.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token đã hết hạn.');
    }

    return found;
  }

  async rotateRefreshToken(oldToken: string): Promise<string> {
    const found = await this.validateRefreshToken(oldToken);
    found.isRevoked = true;
    await found.save();

    return this.generateRefreshToken(found.userId.toString());
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.refreshTokenModel.updateOne({ token }, { isRevoked: true });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId) },
      { isRevoked: true },
    );
  }
}
