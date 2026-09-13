import { BadRequestException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import mongoose from 'mongoose';
import ms, { StringValue } from 'ms';
const saltRounds = 10;

export const hashPasswordHelper = async (plainPassword: string) => {
  try {
    return await bcrypt.hash(plainPassword, saltRounds);
  } catch (error) {
    console.error(error);
  }
};

export const comparePasswordHelper = async (
  plainPassword: string,
  hashedPassword: string,
) => {
  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    console.error('Password is not correct', error);
  }
};

export const hashToken = (token: string) => {
  return createHash('sha256').update(token).digest('hex');
};

export function parseDurationToMs(duration: string | number): number {
  if (typeof duration === 'number') {
    return duration * 1000;
  }

  const result = ms(duration as StringValue);

  if (typeof result !== 'number' || Number.isNaN(result)) {
    throw new Error(`Định dạng thời gian không hợp lệ: "${duration}"`);
  }

  return result;
}

export function validateObjectIdHelper(id: string): void {
  if (!id || !mongoose.isValidObjectId(id)) {
    throw new BadRequestException('Id không đúng định dạng mongodb');
  }
}

export function isDuplicateKeyErrorHelper(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  );
}
