import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

const input = {
  email: 'a@b.c',
  code: 'abc',
  password: 'x',
  confirmPassword: 'x',
};

describe('AuthService.changePassword', () => {
  const setup = (changePassword: any) => {
    const refreshTokens = { revokeAllForUser: vi.fn() };
    const service = new AuthService(
      { changePassword } as any,
      {} as any,
      refreshTokens as any,
    );
    return { service, refreshTokens };
  };

  it('revokes old sessions without exposing the user id', async () => {
    const { service, refreshTokens } = setup(
      vi.fn().mockResolvedValue({ isBeforeCheck: true, userId: 'user-1' }),
    );

    expect(await service.changePassword(input)).toEqual({
      isBeforeCheck: true,
    });
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('keeps sessions when the code is rejected', async () => {
    const { service, refreshTokens } = setup(
      vi.fn().mockRejectedValue(new BadRequestException()),
    );

    await expect(service.changePassword(input)).rejects.toThrow(
      BadRequestException,
    );
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });
});
