import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductService } from './products.service.js';

const PRODUCT_ID = '507f1f77bcf86cd799439011';
const PRODUCT_IMAGE =
  'https://res.cloudinary.com/demo/image/upload/v1/e-commerce/p.jpg';
const VARIANT_IMAGE =
  'https://res.cloudinary.com/demo/image/upload/v1/e-commerce/v.jpg';

describe('ProductService.remove', () => {
  let productModel: any;
  let variantModel: any;
  let orderModel: any;
  let wishlistModel: any;
  let cloudinaryService: any;
  let service: ProductService;

  beforeEach(() => {
    productModel = { findByIdAndDelete: vi.fn() };
    variantModel = {
      find: vi.fn().mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve([{ images: [VARIANT_IMAGE] }]),
        }),
      }),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    orderModel = { countDocuments: vi.fn().mockResolvedValue(0) };
    wishlistModel = { updateMany: vi.fn().mockResolvedValue({}) };
    cloudinaryService = {
      deleteUnusedImages: vi.fn().mockResolvedValue({ deleted: [] }),
    };
    service = new ProductService(
      {} as any,
      productModel,
      {} as any,
      variantModel,
      cloudinaryService,
      orderModel,
      wishlistModel,
    );
  });

  it('chặn xoá sản phẩm đã có đơn hàng và không đụng tới dữ liệu khác', async () => {
    orderModel.countDocuments.mockResolvedValue(2);

    const error = await service.remove(PRODUCT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain('2 đơn hàng');
    expect(orderModel.countDocuments).toHaveBeenCalledWith({
      'items.product': PRODUCT_ID,
    });
    expect(productModel.findByIdAndDelete).not.toHaveBeenCalled();
    expect(variantModel.deleteMany).not.toHaveBeenCalled();
    expect(wishlistModel.updateMany).not.toHaveBeenCalled();
    expect(cloudinaryService.deleteUnusedImages).not.toHaveBeenCalled();
  });

  it('xoá sản phẩm chưa có đơn kèm biến thể, gỡ khỏi wishlist và dọn ảnh', async () => {
    productModel.findByIdAndDelete.mockResolvedValue({
      _id: PRODUCT_ID,
      images: [PRODUCT_IMAGE],
    });

    const result = await service.remove(PRODUCT_ID);

    expect(result.message).toBe('Xoá sản phẩm thành công');
    expect(variantModel.deleteMany).toHaveBeenCalledWith({
      product: PRODUCT_ID,
    });
    expect(wishlistModel.updateMany).toHaveBeenCalledWith(
      { products: PRODUCT_ID },
      { $pull: { products: PRODUCT_ID } },
    );
    expect(cloudinaryService.deleteUnusedImages).toHaveBeenCalledWith([
      PRODUCT_IMAGE,
      VARIANT_IMAGE,
    ]);
  });

  it('báo không tìm thấy và không xoá biến thể khi sản phẩm không tồn tại', async () => {
    productModel.findByIdAndDelete.mockResolvedValue(null);

    await expect(service.remove(PRODUCT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(variantModel.deleteMany).not.toHaveBeenCalled();
  });
});
