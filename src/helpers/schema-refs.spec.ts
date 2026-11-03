import mongoose, { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { AddressSchema } from '../modules/addresses/schemas/address.schema.js';
import { CartSchema } from '../modules/carts/schemas/cart.schema.js';
import { CategorySchema } from '../modules/categories/schemas/category.schema.js';
import { OrderSchema } from '../modules/orders/schemas/order.schema.js';
import { PaymentSchema } from '../modules/payments/schemas/payment.schema.js';
import { ProductVariantSchema } from '../modules/product-variants/schemas/product-variant.schema.js';
import { ProductSchema } from '../modules/products/schemas/product.schema.js';
import { RefreshTokenSchema } from '../modules/refresh-tokens/schemas/refresh-token.schema.js';
import { RefundSchema } from '../modules/refunds/schemas/refund.schema.js';
import { WishlistSchema } from '../modules/wishlist/schemas/wishlist.schema.js';

// Khai báo `type: Types.ObjectId` trong @Prop bị Nest hiểu là Mixed, Mongoose
// không ép kiểu và id bị lưu thành chuỗi. Các field tham chiếu phải là ObjectId.
const refPaths: [string, string, mongoose.Schema][] = [
  ['Address', 'user', AddressSchema],
  ['Cart', 'user', CartSchema],
  ['Cart', 'items.product', CartSchema],
  ['Cart', 'items.variant', CartSchema],
  ['Category', 'parentId', CategorySchema],
  ['Order', 'user', OrderSchema],
  ['Order', 'addressId', OrderSchema],
  ['Order', 'coupon', OrderSchema],
  ['Order', 'items.product', OrderSchema],
  ['Order', 'items.variant', OrderSchema],
  ['Payment', 'orderId', PaymentSchema],
  ['Payment', 'userId', PaymentSchema],
  ['ProductVariant', 'product', ProductVariantSchema],
  ['Product', 'category', ProductSchema],
  ['RefreshToken', 'userId', RefreshTokenSchema],
  ['Refund', 'orderId', RefundSchema],
  ['Refund', 'userId', RefundSchema],
  ['Wishlist', 'products', WishlistSchema],
];

describe('schema reference fields', () => {
  it.each(refPaths)('%s.%s is cast to ObjectId', (_, path, schema) => {
    const type = schema.path(path) as any;
    const instance = (type.embeddedSchemaType ?? type.caster ?? type).instance;
    expect(instance).toBe('ObjectId');
  });

  it('stores a string id as ObjectId', () => {
    const Payment = mongoose.model('PaymentRefTest', PaymentSchema);
    const id = '507f1f77bcf86cd799439011';
    const payment = new Payment({ orderId: id, userId: id });
    expect(payment.orderId).toBeInstanceOf(Types.ObjectId);
    expect(payment.userId).toBeInstanceOf(Types.ObjectId);
  });

  it('allows order items without an image', () => {
    const Order = mongoose.model('OrderImageTest', OrderSchema);
    const id = '507f1f77bcf86cd799439011';
    const order = new Order({
      items: [
        { product: id, productName: 'A', price: 1, quantity: 1, image: '' },
      ],
    });
    expect(order.validateSync()?.errors['items.0.image']).toBeUndefined();
  });
});

describe('cost price', () => {
  it.each([
    ['Product', ProductSchema],
    ['ProductVariant', ProductVariantSchema],
  ])('%s.costPrice is hidden from queries by default', (_, schema) => {
    expect((schema.path('costPrice') as any).options.select).toBe(false);
  });
});
