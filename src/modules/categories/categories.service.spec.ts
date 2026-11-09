import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryService } from './categories.service.js';

const CATEGORY_ID = '507f1f77bcf86cd799439011';
const IMAGE_URL =
  'https://res.cloudinary.com/demo/image/upload/v1/e-commerce/c.jpg';

describe('CategoryService.remove', () => {
  let categoryModel: any;
  let productModel: any;
  let cloudinaryService: any;
  let service: CategoryService;

  beforeEach(() => {
    categoryModel = {
      exists: vi.fn().mockResolvedValue(null),
      findByIdAndDelete: vi.fn(),
    };
    productModel = { countDocuments: vi.fn().mockResolvedValue(0) };
    cloudinaryService = {
      deleteUnusedImages: vi.fn().mockResolvedValue({ deleted: [] }),
    };
    service = new CategoryService(
      categoryModel,
      productModel,
      cloudinaryService,
    );
  });

  it('chặn xoá khi còn danh mục con', async () => {
    categoryModel.exists.mockResolvedValue({ _id: 'child' });

    await expect(service.remove(CATEGORY_ID)).rejects.toThrow(
      /danh mục con/,
    );
    expect(categoryModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('chặn xoá khi còn sản phẩm, kể cả sản phẩm đã ẩn', async () => {
    productModel.countDocuments.mockResolvedValue(3);

    const error = await service.remove(CATEGORY_ID).catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain('3 sản phẩm');
    // Không lọc isActive: sản phẩm ẩn vẫn trỏ tới danh mục
    expect(productModel.countDocuments).toHaveBeenCalledWith({
      category: CATEGORY_ID,
    });
    expect(categoryModel.findByIdAndDelete).not.toHaveBeenCalled();
    expect(cloudinaryService.deleteUnusedImages).not.toHaveBeenCalled();
  });

  it('xoá danh mục trống và dọn ảnh', async () => {
    categoryModel.findByIdAndDelete.mockResolvedValue({
      _id: CATEGORY_ID,
      image: IMAGE_URL,
    });

    const result = await service.remove(CATEGORY_ID);

    expect(result.message).toBe('Xoá danh mục thành công');
    expect(cloudinaryService.deleteUnusedImages).toHaveBeenCalledWith([
      IMAGE_URL,
    ]);
  });

  it('báo không tìm thấy khi danh mục không tồn tại', async () => {
    categoryModel.findByIdAndDelete.mockResolvedValue(null);

    await expect(service.remove(CATEGORY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
