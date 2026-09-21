import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  it('should allow admin role only when roles include ADMIN', () => {
    const guard = new RolesGuard(new Reflector());
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.ADMIN } }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    vi.spyOn(Reflector.prototype, 'getAllAndOverride').mockReturnValue([
      UserRole.ADMIN,
    ] as any);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject non-admin user when ADMIN is required', () => {
    const guard = new RolesGuard(new Reflector());
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.USER } }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    vi.spyOn(Reflector.prototype, 'getAllAndOverride').mockReturnValue([
      UserRole.ADMIN,
    ] as any);

    expect(() => guard.canActivate(context)).toThrowError();
  });
});
