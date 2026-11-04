import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { hashToken } from '../../helpers/utils.js';
import {
  ROTATION_GRACE_MS,
  RefreshTokensService,
} from './refresh-tokens.service.js';

const userId = new Types.ObjectId();
const future = () => new Date(Date.now() + 60 * 60 * 1000);

const setup = (current: Record<string, unknown> | null) => {
  const model = {
    findOne: vi.fn().mockResolvedValue(current),
    findOneAndUpdate: vi.fn().mockResolvedValue({
      isRevoked: false,
      expiresAt: future(),
    }),
    updateOne: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({}),
  };
  const config = {
    get: vi.fn((key: string, fallback?: string) =>
      key === 'JWT_SECRET' ? 'test-secret' : fallback,
    ),
  };
  const service = new RefreshTokensService(model as any, config as any);
  return { service, model };
};

const activeToken = (extra: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  userId,
  isRevoked: false,
  expiresAt: future(),
  ...extra,
});

describe('RefreshTokensService.rotateRefreshToken', () => {
  it('xoay vòng token hợp lệ và đánh dấu token cũ', async () => {
    const current = activeToken();
    const { service, model } = setup(current);

    const result = await service.rotateRefreshToken('old');

    expect(result.userId).toBe(userId);
    expect(result.token).not.toBe('old');
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { token: hashToken(result.token) },
      expect.anything(),
      expect.objectContaining({ upsert: true }),
    );
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: current._id, isRevoked: false },
      { $set: { isRevoked: true, rotatedAt: expect.any(Date) } },
    );
  });

  it('cùng token cũ luôn cho ra cùng token mới', async () => {
    const first = await setup(activeToken()).service.rotateRefreshToken('old');
    const second = await setup(
      activeToken({ isRevoked: true, rotatedAt: new Date() }),
    ).service.rotateRefreshToken('old');

    expect(second.token).toBe(first.token);
  });

  it('từ chối token đã xoay vòng quá khoảng ân hạn', async () => {
    const { service } = setup(
      activeToken({
        isRevoked: true,
        rotatedAt: new Date(Date.now() - ROTATION_GRACE_MS - 1000),
      }),
    );
    await expect(service.rotateRefreshToken('old')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('từ chối token bị thu hồi do đăng xuất', async () => {
    const { service } = setup(activeToken({ isRevoked: true }));
    await expect(service.rotateRefreshToken('old')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('từ chối khi token kế tiếp đã bị thu hồi', async () => {
    const { service, model } = setup(
      activeToken({ isRevoked: true, rotatedAt: new Date() }),
    );
    model.findOneAndUpdate.mockResolvedValue({
      isRevoked: true,
      expiresAt: future(),
    });
    await expect(service.rotateRefreshToken('old')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('từ chối token hết hạn hoặc không tồn tại', async () => {
    await expect(
      setup(activeToken({ expiresAt: new Date(0) })).service.rotateRefreshToken(
        'old',
      ),
    ).rejects.toThrow(UnauthorizedException);
    await expect(setup(null).service.rotateRefreshToken('old')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('đọc lại bản ghi khi upsert va unique index', async () => {
    const { service, model } = setup(activeToken());
    model.findOneAndUpdate.mockRejectedValue({ code: 11000 });
    model.findOne
      .mockResolvedValueOnce(activeToken())
      .mockResolvedValueOnce({ isRevoked: false, expiresAt: future() });

    await expect(service.rotateRefreshToken('old')).resolves.toMatchObject({
      userId,
    });
  });
});

describe('RefreshTokensService.revokeRefreshToken', () => {
  it('thu hồi cả token kế tiếp', async () => {
    const { service, model } = setup(null);
    const { token: successor } = await setup(
      activeToken(),
    ).service.rotateRefreshToken('old');

    await service.revokeRefreshToken('old');

    expect(model.updateMany).toHaveBeenCalledWith(
      { token: { $in: [hashToken('old'), hashToken(successor)] } },
      { isRevoked: true },
    );
  });
});
