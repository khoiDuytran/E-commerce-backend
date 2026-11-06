import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BannersService } from './banners.service.js';

const BANNER_ID = '507f1f77bcf86cd799439011';
const IMAGE_URL =
  'https://res.cloudinary.com/demo/image/upload/v1/e-commerce/a.jpg';
const VIDEO_URL =
  'https://res.cloudinary.com/demo/video/upload/v1/e-commerce/b.mp4';

// Mô phỏng getMediaResource: chỉ nhận ra URL Cloudinary của hệ thống
const resourceOf = (url: string) => {
  if (url === IMAGE_URL)
    return { publicId: 'e-commerce/a', resourceType: 'image' };
  if (url === VIDEO_URL)
    return { publicId: 'e-commerce/b', resourceType: 'video' };
  return null;
};

describe('BannersService', () => {
  let bannerModel: any;
  let cloudinaryService: any;
  let service: BannersService;

  beforeEach(() => {
    bannerModel = {
      create: vi.fn().mockImplementation((data) => Promise.resolve(data)),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
      find: vi.fn(),
    };
    cloudinaryService = {
      getMediaResource: vi.fn(resourceOf),
      deleteUnusedImages: vi.fn().mockResolvedValue({ deleted: [] }),
    };
    service = new BannersService(bannerModel, cloudinaryService);
  });

  describe('create', () => {
    it('tạo banner video và bỏ link rỗng', async () => {
      const result = await service.create({
        title: 'Bộ sưu tập mới',
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
        link: '',
      });

      expect(bannerModel.create).toHaveBeenCalledWith({
        title: 'Bộ sưu tập mới',
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
      });
      expect(result.message).toBe('Tạo banner thành công');
    });

    it('từ chối khi loại banner không khớp file đã tải lên', async () => {
      await expect(
        service.create({
          title: 'Sai loại',
          mediaType: 'image',
          mediaUrl: VIDEO_URL,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(bannerModel.create).not.toHaveBeenCalled();
    });

    it('chấp nhận URL ngoài Cloudinary vì không xác định được loại', async () => {
      await service.create({
        title: 'Ảnh ngoài',
        mediaType: 'image',
        mediaUrl: 'https://example.com/a.jpg',
      });
      expect(bannerModel.create).toHaveBeenCalledOnce();
    });
  });

  describe('findActive', () => {
    it('chỉ lấy banner đang bật theo thứ tự hiển thị', async () => {
      const query = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      };
      bannerModel.find.mockReturnValue(query);

      await service.findActive();

      expect(bannerModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(query.sort).toHaveBeenCalledWith({ sortOrder: 1, createdAt: -1 });
    });
  });

  describe('update', () => {
    const previous = {
      _id: BANNER_ID,
      mediaType: 'image',
      mediaUrl: IMAGE_URL,
    };

    it('báo lỗi khi không tìm thấy banner', async () => {
      bannerModel.findById.mockResolvedValue(null);
      await expect(
        service.update({ _id: BANNER_ID, title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('từ chối đổi sang video mà vẫn giữ file ảnh cũ', async () => {
      bannerModel.findById.mockResolvedValue(previous);
      await expect(
        service.update({ _id: BANNER_ID, mediaType: 'video' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(bannerModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('dọn file cũ khi đổi sang video mới', async () => {
      bannerModel.findById.mockResolvedValue(previous);
      bannerModel.findByIdAndUpdate.mockResolvedValue({
        ...previous,
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
      });

      await service.update({
        _id: BANNER_ID,
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
      });

      expect(cloudinaryService.deleteUnusedImages).toHaveBeenCalledWith([
        IMAGE_URL,
      ]);
    });

    it('xóa đường dẫn khi gửi link null và không dọn file khi không đổi', async () => {
      bannerModel.findById.mockResolvedValue(previous);
      bannerModel.findByIdAndUpdate.mockResolvedValue(previous);

      await service.update({ _id: BANNER_ID, link: null });

      expect(bannerModel.findByIdAndUpdate).toHaveBeenCalledWith(
        BANNER_ID,
        { $set: {}, $unset: { link: 1 } },
        { returnDocument: 'after', runValidators: true },
      );
      expect(cloudinaryService.deleteUnusedImages).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('xóa banner và dọn file trên Cloudinary', async () => {
      bannerModel.findByIdAndDelete.mockResolvedValue({ mediaUrl: VIDEO_URL });

      const result = await service.remove(BANNER_ID);

      expect(cloudinaryService.deleteUnusedImages).toHaveBeenCalledWith([
        VIDEO_URL,
      ]);
      expect(result.message).toBe('Xóa banner thành công');
    });

    it('báo lỗi với id sai định dạng', async () => {
      await expect(service.remove('abc')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(bannerModel.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });
});
