import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductVariantsService } from './product-variants.service.js';

const VARIANT_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID = '507f1f77bcf86cd799439022';
const VARIANT_IMAGE =
  'https://res.cloudinary.com/demo/image/upload/v1/e-commerce/v.jpg';

describe('ProductVariantsService.remove', () => {
  let variantModel: any;
  let productModel: any;
  let orderModel: any;
  let cloudinaryService: any;
  let service: ProductVariantsService;

  beforeEach(() => {
    variantModel = {
      findByIdAndDelete: vi.fn(),
      // Tổng tồn của các biến thể còn lại, dùng để đồng bộ tồn kho sản phẩm
      aggregate: vi.fn().mockResolvedValue([{ stock: 4 }]),
    };
    productModel = { updateOne: vi.fn().mockResolvedValue({}) };
    orderModel = { countDocuments: vi.fn().mockResolvedValue(0) };
    cloudinaryService = {
      deleteUnusedImages: vi.fn().mockResolvedValue({ deleted: [] }),
    };
    service = new ProductVariantsService(
      {} as any,
      variantModel,
      productModel,
      cloudinaryService,
      orderModel,
    );
  });

  it('chặn xoá biến thể đã có đơn hàng', async () => {
    orderModel.countDocuments.mockResolvedValue(1);

    const error = await service.remove(VARIANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain('1 đơn hàng');
    expect(orderModel.countDocuments).toHaveBeenCalledWith({
      'items.variant': VARIANT_ID,
    });
    expect(variantModel.findByIdAndDelete).not.toHaveBeenCalled();
    expect(productModel.updateOne).not.toHaveBeenCalled();
    expect(cloudinaryService.deleteUnusedImages).not.toHaveBeenCalled();
  });

  it('xoá biến thể chưa có đơn, đồng bộ tồn kho sản phẩm và dọn ảnh', async () => {
    variantModel.findByIdAndDelete.mockResolvedValue({
      _id: VARIANT_ID,
      product: PRODUCT_ID,
      images: [VARIANT_IMAGE],
    });

    const result = await service.remove(VARIANT_ID);

    expect(result.message).toBe('Xoá biến thể sản phẩm thành công');
    expect(productModel.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      { stock: 4 },
    );
    expect(cloudinaryService.deleteUnusedImages).toHaveBeenCalledWith([
      VARIANT_IMAGE,
    ]);
  });

  it('báo không tìm thấy khi biến thể không tồn tại', async () => {
    variantModel.findByIdAndDelete.mockResolvedValue(null);

    await expect(service.remove(VARIANT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
