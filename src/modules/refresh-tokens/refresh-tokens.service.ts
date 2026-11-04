import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema.js';
import { hashToken, parseDurationToMs } from '../../helpers/utils.js';

// Token cũ vẫn đổi được trong khoảng này sau khi đã xoay vòng, để các request
// song song (nhiều tab, nhiều instance frontend) không làm khách bị đăng xuất
export const ROTATION_GRACE_MS = 60 * 1000;

const isDuplicateKeyError = (error: unknown) =>
  (error as { code?: number })?.code === 11000;

@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    private configService: ConfigService,
  ) {}

  private newExpiresAt() {
    return new Date(
      Date.now() +
        parseDurationToMs(
          this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRE', '7d'),
        ),
    );
  }

  // Token kế tiếp suy ra cố định từ token cũ: mọi lần xoay vòng cùng một token
  // đều cho ra cùng kết quả, nên không cần chia sẻ trạng thái giữa các request
  private successorOf(token: string) {
    return createHmac('sha256', this.configService.get<string>('JWT_SECRET')!)
      .update(`refresh-rotation:${token}`)
      .digest('hex');
  }

  async generateRefreshToken(userId: string): Promise<string> {
    const token = uuidv4();
    await this.refreshTokenModel.create({
      token: hashToken(token),
      userId: new Types.ObjectId(userId),
      expiresAt: this.newExpiresAt(),
    });
    return token;
  }

  // Tạo bản ghi cho token kế tiếp nếu chưa có. Hai request cùng upsert có thể
  // va nhau ở unique index, khi đó bản ghi đã được request kia tạo nên đọc lại.
  private async upsertSuccessor(hashed: string, userId: Types.ObjectId) {
    const filter = { token: hashed };
    try {
      return await this.refreshTokenModel.findOneAndUpdate(
        filter,
        { $setOnInsert: { userId, expiresAt: this.newExpiresAt() } },
        { upsert: true, returnDocument: 'after' },
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      return this.refreshTokenModel.findOne(filter);
    }
  }

  async rotateRefreshToken(
    oldToken: string,
  ): Promise<{ token: string; userId: Types.ObjectId }> {
    const now = new Date();
    const current = await this.refreshTokenModel.findOne({
      token: hashToken(oldToken),
    });

    // Token bị thu hồi do đăng xuất hoặc đổi mật khẩu không có rotatedAt
    const inGrace =
      !!current?.rotatedAt &&
      now.getTime() - current.rotatedAt.getTime() < ROTATION_GRACE_MS;
    if (!current || (current.isRevoked && !inGrace)) {
      throw new UnauthorizedException('Refresh token không hợp lệ.');
    }
    if (current.expiresAt < now) {
      throw new UnauthorizedException('Refresh token đã hết hạn.');
    }

    const successor = this.successorOf(oldToken);
    const next = await this.upsertSuccessor(
      hashToken(successor),
      current.userId,
    );
    // Token kế tiếp đã bị thu hồi (đăng xuất, đổi mật khẩu) thì phiên đã kết thúc
    if (!next || next.isRevoked || next.expiresAt < now) {
      throw new UnauthorizedException('Refresh token không hợp lệ.');
    }

    // Điều kiện isRevoked: false để chỉ request đầu tiên ghi rotatedAt,
    // các request sau không kéo dài khoảng ân hạn
    await this.refreshTokenModel.updateOne(
      { _id: current._id, isRevoked: false },
      { $set: { isRevoked: true, rotatedAt: now } },
    );

    return { token: successor, userId: current.userId };
  }

  // Thu hồi cả token kế tiếp: đăng xuất bằng token cũ trong khoảng ân hạn
  // không được để lại token mới còn hiệu lực
  async revokeRefreshToken(token: string): Promise<void> {
    await this.refreshTokenModel.updateMany(
      {
        token: {
          $in: [hashToken(token), hashToken(this.successorOf(token))],
        },
      },
      { isRevoked: true },
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId) },
      { isRevoked: true },
    );
  }
}
