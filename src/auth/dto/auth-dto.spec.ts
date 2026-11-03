import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ChangePasswordAuthDto } from './change-password.dto.js';
import { CodeAuthDto } from './code-auth.dto.js';
import { EmailAuthDto } from './email-auth.dto.js';

const injection = { $ne: null };

const errorFields = async (cls: any, body: object) => {
  const errors = await validate(plainToInstance(cls, body) as object);
  return errors.map((error) => error.property);
};

describe('auth DTO', () => {
  it('rejects operator objects in change-password', async () => {
    const fields = await errorFields(ChangePasswordAuthDto, {
      email: 'a@b.c',
      code: injection,
      password: 'x',
      confirmPassword: 'x',
    });
    expect(fields).toEqual(['code']);
  });

  it('rejects operator objects in check-code', async () => {
    const fields = await errorFields(CodeAuthDto, {
      _id: '507f1f77bcf86cd799439011',
      code: injection,
    });
    expect(fields).toEqual(['code']);
  });

  it('rejects operator objects as email', async () => {
    expect(await errorFields(EmailAuthDto, { email: injection })).toEqual([
      'email',
    ]);
  });

  it('accepts valid change-password input', async () => {
    const fields = await errorFields(ChangePasswordAuthDto, {
      email: 'a@b.c',
      code: 'abc',
      password: 'x',
      confirmPassword: 'x',
    });
    expect(fields).toEqual([]);
  });
});
