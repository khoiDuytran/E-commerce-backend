import { BadRequestException, NotFoundException } from '@nestjs/common';
import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => 'user-1' },
  email: 'a@example.com',
  name: 'A',
  codeId: 'abc',
  codeExpired: dayjs().add(5, 'minutes').toDate(),
  updateOne: vi.fn().mockResolvedValue({}),
  ...overrides,
});

const setup = (user: unknown) => {
  const userModel = { findOne: vi.fn().mockResolvedValue(user) };
  const mailer = { sendMail: vi.fn().mockResolvedValue({}) };
  const service = new UsersService(
    userModel as any,
    mailer as any,
    {} as any,
  );
  return { service, userModel, mailer };
};

describe('UsersService quên mật khẩu', () => {
  it('báo lỗi khi email chưa đăng ký và không gửi mail', async () => {
    const { service, mailer } = setup(null);
    await expect(service.retryPassword('x@example.com')).rejects.toThrow(
      NotFoundException,
    );
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('bỏ khoảng trắng của email trước khi tìm', async () => {
    const user = makeUser();
    const { service, userModel, mailer } = setup(user);
    await service.retryPassword('  a@example.com ');
    expect(userModel.findOne).toHaveBeenCalledWith({ email: 'a@example.com' });
    expect(mailer.sendMail).toHaveBeenCalledOnce();
  });

  it('kiểm tra mã đúng mà không xóa mã', async () => {
    const user = makeUser();
    const { service } = setup(user);
    expect(
      await service.checkResetPasswordCode('a@example.com', 'abc'),
    ).toEqual({ isValid: true });
    expect(user.updateOne).not.toHaveBeenCalled();
  });

  it('từ chối mã sai hoặc hết hạn', async () => {
    const { service } = setup(makeUser());
    await expect(
      service.checkResetPasswordCode('a@example.com', 'sai'),
    ).rejects.toThrow(BadRequestException);

    const expired = setup(
      makeUser({ codeExpired: dayjs().subtract(1, 'minute').toDate() }),
    );
    await expect(
      expired.service.checkResetPasswordCode('a@example.com', 'abc'),
    ).rejects.toThrow(BadRequestException);
  });

  it('từ chối khi tài khoản chưa có mã', async () => {
    const { service } = setup(makeUser({ codeId: null }));
    await expect(
      service.checkResetPasswordCode('a@example.com', 'abc'),
    ).rejects.toThrow(BadRequestException);
  });

  it('đổi mật khẩu với mã đúng và xóa mã', async () => {
    const user = makeUser();
    const { service } = setup(user);
    const result = await service.changePassword({
      email: 'a@example.com',
      code: 'abc',
      password: 'moi123',
      confirmPassword: 'moi123',
    });
    expect(result).toEqual({ isBeforeCheck: true, userId: 'user-1' });
    expect(user.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ codeId: null, codeExpired: null }),
    );
  });

  it('không đổi mật khẩu khi mã sai', async () => {
    const user = makeUser();
    const { service } = setup(user);
    await expect(
      service.changePassword({
        email: 'a@example.com',
        code: 'sai',
        password: 'moi123',
        confirmPassword: 'moi123',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(user.updateOne).not.toHaveBeenCalled();
  });
});
