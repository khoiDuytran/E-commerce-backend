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

export const MAX_PAGE_SIZE = 100;

// Các toán tử chạy được JavaScript hoặc biểu thức tuỳ ý trên MongoDB
const UNSAFE_QUERY_OPERATORS = new Set([
  '$where',
  '$expr',
  '$function',
  '$accumulator',
  '$jsonSchema',
]);

/** Xoá toán tử nguy hiểm khỏi filter do aqp parse từ URL (cả filter lồng nhau) */
export function stripUnsafeOperators(filter: unknown): void {
  if (Array.isArray(filter)) {
    filter.forEach(stripUnsafeOperators);
    return;
  }
  if (Object.prototype.toString.call(filter) !== '[object Object]') return;

  const record = filter as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (UNSAFE_QUERY_OPERATORS.has(key)) {
      delete record[key];
    } else {
      stripUnsafeOperators(record[key]);
    }
  }
}

/**
 * Kiểm tra id trong filter từ query string trước khi Mongoose ép kiểu,
 * để id sai định dạng trả 400 thay vì lỗi CastError 500.
 */
export function validateIdFilter(
  filter: Record<string, any>,
  key: string,
): void {
  const value = filter[key];
  if (value === undefined) return;
  // aqp chuyển `key=a,b` thành { $in: [a, b] }
  const ids: unknown[] = Array.isArray(value?.$in) ? value.$in : [value];
  const isIdList = ids.every(
    (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id),
  );
  if (!isIdList) {
    throw new BadRequestException('Id không đúng định dạng mongodb');
  }
}

export function validateObjectIdHelper(id: string): void {
  if (!id || !mongoose.isValidObjectId(id)) {
    throw new BadRequestException('Id không đúng định dạng mongodb');
  }
}

/**
 * Ghép giá bán và giá gốc khi cập nhật, rồi kiểm tra giá gốc >= giá bán.
 * Một trong hai giá có thể không gửi lên: lấy giá đang lưu để so.
 * Trả về phần update cho Mongoose (originalPrice null nghĩa là xoá giá gốc).
 */
export function resolvePriceUpdate(
  current: { salePrice: number; originalPrice?: number | null },
  update: { salePrice?: number; originalPrice?: number | null },
): { $unset?: { originalPrice: 1 } } {
  const salePrice = update.salePrice ?? current.salePrice;
  const originalPrice =
    update.originalPrice === undefined
      ? current.originalPrice
      : update.originalPrice;
  assertOriginalPrice(salePrice, originalPrice);
  return update.originalPrice === null ? { $unset: { originalPrice: 1 } } : {};
}

export function assertOriginalPrice(
  salePrice: number,
  originalPrice?: number | null,
): void {
  if (originalPrice != null && originalPrice < salePrice) {
    throw new BadRequestException(
      'Giá trước giảm phải lớn hơn hoặc bằng giá bán',
    );
  }
}

/**
 * Bỏ một field khỏi filter và sort lấy từ query string của API public, kể cả trong
 * $or/$and lồng nhau, để người ngoài không dò được giá trị field ẩn (như giá nhập)
 * bằng cách lọc hoặc sắp xếp theo nó.
 */
export function removeQueryField(
  filter: unknown,
  sort: unknown,
  field: string,
): void {
  const strip = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(strip);
      return;
    }
    if (Object.prototype.toString.call(value) !== '[object Object]') return;
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key === field || key.startsWith(`${field}.`)) delete record[key];
      else strip(record[key]);
    }
  };
  strip(filter);
  if (sort && typeof sort === 'object') {
    delete (sort as Record<string, unknown>)[field];
  }
}

/** Chuyển các field gửi null thành $unset để xoá giá trị đã lưu */
export function nullFieldsToUnset(
  update: Record<string, unknown>,
  fields: string[],
): Record<string, 1> {
  const unset: Record<string, 1> = {};
  for (const field of fields) {
    if (update[field] === null) {
      delete update[field];
      unset[field] = 1;
    }
  }
  return unset;
}

export function isDuplicateKeyErrorHelper(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  );
}
