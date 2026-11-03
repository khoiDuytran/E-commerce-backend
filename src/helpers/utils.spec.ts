import aqp from 'api-query-params';
import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  assertOriginalPrice,
  nullFieldsToUnset,
  removeQueryField,
  resolvePriceUpdate,
  stripUnsafeOperators,
  validateIdFilter,
} from './utils.js';

describe('validateIdFilter', () => {
  const id = '6aa61a0317c72c723e5987ce';

  it('accepts a single id and leaves it for Mongoose to cast', () => {
    const filter: Record<string, any> = { category: id };
    validateIdFilter(filter, 'category');
    expect(filter).toEqual({ category: id });
  });

  it('accepts a comma separated list from aqp', () => {
    const other = '6aa61a0317c72c723e5987cf';
    const { filter } = aqp(`category=${id},${other}`);
    validateIdFilter(filter, 'category');
    expect(filter.category).toEqual({ $in: [id, other] });
  });

  it('ignores a missing key', () => {
    const filter: Record<string, any> = { name: 'a' };
    validateIdFilter(filter, 'category');
    expect(filter).toEqual({ name: 'a' });
  });

  it('rejects malformed ids with 400 instead of a CastError', () => {
    expect(() => validateIdFilter({ category: 'abc' }, 'category')).toThrow(
      BadRequestException,
    );
    const { filter } = aqp(`category=${id},abc`);
    expect(() => validateIdFilter(filter, 'category')).toThrow(
      BadRequestException,
    );
  });
});

describe('stripUnsafeOperators', () => {
  it('removes $where sent as a query key', () => {
    const { filter } = aqp({ $where: 'sleep(5000)', isActive: 'true' } as any);
    stripUnsafeOperators(filter);
    expect(filter).toEqual({ isActive: true });
  });

  it('removes operators nested inside the JSON filter param', () => {
    const { filter } = aqp({
      filter: '{"$or":[{"$where":"sleep(5000)"},{"name":"a"}]}',
    } as any);
    stripUnsafeOperators(filter);
    expect(filter).toEqual({ $or: [{}, { name: 'a' }] });
  });

  it('keeps regex search and comparison filters', () => {
    const { filter } = aqp('name=/ao/i&basePrice>100');
    stripUnsafeOperators(filter);
    expect(filter.name).toBeInstanceOf(RegExp);
    expect(filter.basePrice).toEqual({ $gt: 100 });
  });
});

describe('assertOriginalPrice', () => {
  it('accepts a missing original price or one at least the sale price', () => {
    expect(() => assertOriginalPrice(100, undefined)).not.toThrow();
    expect(() => assertOriginalPrice(100, null)).not.toThrow();
    expect(() => assertOriginalPrice(100, 100)).not.toThrow();
    expect(() => assertOriginalPrice(100, 150)).not.toThrow();
  });

  it('rejects an original price lower than the sale price', () => {
    expect(() => assertOriginalPrice(100, 90)).toThrow(BadRequestException);
  });
});

describe('resolvePriceUpdate', () => {
  const current = { salePrice: 100, originalPrice: 150 };

  it('compares a new sale price with the stored original price', () => {
    expect(() => resolvePriceUpdate(current, { salePrice: 140 })).not.toThrow();
    expect(() => resolvePriceUpdate(current, { salePrice: 160 })).toThrow(
      BadRequestException,
    );
  });

  it('compares a new original price with the stored sale price', () => {
    expect(() => resolvePriceUpdate(current, { originalPrice: 90 })).toThrow(
      BadRequestException,
    );
  });

  it('allows raising the sale price above the old original price when both change', () => {
    expect(
      resolvePriceUpdate(current, { salePrice: 200, originalPrice: 250 }),
    ).toEqual({});
  });

  it('unsets the original price when null is sent', () => {
    expect(
      resolvePriceUpdate(current, { salePrice: 200, originalPrice: null }),
    ).toEqual({ $unset: { originalPrice: 1 } });
  });
});

describe('removeQueryField', () => {
  it('removes a hidden field from filter and sort, including nested $or', () => {
    const { filter, sort } = aqp(
      'costPrice>100&name=/ao/i&sort=-costPrice,basePrice&filter={"$or":[{"costPrice":{"$lt":5}},{"stock":1}]}',
    );
    removeQueryField(filter, sort, 'costPrice');
    expect(JSON.stringify(filter)).not.toContain('costPrice');
    expect(filter.name).toBeInstanceOf(RegExp);
    expect(filter.$or).toEqual([{}, { stock: 1 }]);
    expect(sort).toEqual({ basePrice: 1 });
  });
});

describe('nullFieldsToUnset', () => {
  it('moves null fields to $unset and keeps the rest', () => {
    const update: Record<string, unknown> = { costPrice: null, name: 'A' };
    expect(nullFieldsToUnset(update, ['costPrice'])).toEqual({ costPrice: 1 });
    expect(update).toEqual({ name: 'A' });
  });

  it('leaves numbers and missing fields alone', () => {
    const update: Record<string, unknown> = { costPrice: 0 };
    expect(nullFieldsToUnset(update, ['costPrice', 'other'])).toEqual({});
    expect(update).toEqual({ costPrice: 0 });
  });
});
