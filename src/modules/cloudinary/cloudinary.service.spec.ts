import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudinaryService } from './cloudinary.service.js';

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: { destroy: vi.fn() },
    utils: { api_sign_request: vi.fn(() => 'signed') },
  },
}));

const OWN_URL = (id: string) =>
  `https://res.cloudinary.com/demo/image/upload/v123/e-commerce/${id}.jpg`;

const OWN_VIDEO_URL = (id: string) =>
  `https://res.cloudinary.com/demo/video/upload/v123/e-commerce/${id}.mp4`;

const emptyModel = () => ({ distinct: vi.fn().mockResolvedValue([]) });

const configured = {
  get: (key: string) =>
    ({
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
    })[key],
} as unknown as ConfigService;

const createService = (
  config: ConfigService,
  models: Partial<
    Record<'product' | 'order', ReturnType<typeof emptyModel>>
  > = {},
) =>
  new CloudinaryService(
    config,
    (models.product ?? emptyModel()) as never,
    emptyModel() as never,
    (models.order ?? emptyModel()) as never,
    emptyModel() as never, // category
    emptyModel() as never, // user
    emptyModel() as never, // banner
  );

describe('CloudinaryService.getPublicId', () => {
  const service = createService(configured);

  it('lấy public id của ảnh do hệ thống tải lên', () => {
    expect(service.getPublicId(OWN_URL('abc'))).toBe('e-commerce/abc');
  });

  it('nhận ra video do hệ thống tải lên', () => {
    expect(service.getMediaResource(OWN_VIDEO_URL('clip'))).toEqual({
      publicId: 'e-commerce/clip',
      resourceType: 'video',
    });
  });

  it.each([
    ['loại tài nguyên khác', 'https://res.cloudinary.com/demo/raw/upload/v1/e-commerce/a.pdf'],
    ['không phải URL', 'abc'],
    ['tên miền khác', 'https://example.com/demo/image/upload/e-commerce/a.jpg'],
    [
      'cloud khác',
      'https://res.cloudinary.com/other/image/upload/e-commerce/a.jpg',
    ],
    [
      'thư mục khác',
      'https://res.cloudinary.com/demo/image/upload/v1/banners/a.jpg',
    ],
    [
      'thư mục có tiền tố giống',
      'https://res.cloudinary.com/demo/image/upload/v1/e-commerce-old/a.jpg',
    ],
    [
      'thư mục lồng bên trong',
      'https://res.cloudinary.com/demo/image/upload/v1/banners/e-commerce/a.jpg',
    ],
  ])('bỏ qua %s', (_name, url) => {
    expect(service.getPublicId(url)).toBeNull();
  });

  it('bỏ qua mọi URL khi chưa cấu hình Cloudinary', () => {
    const unconfigured = createService({
      get: () => undefined,
    } as unknown as ConfigService);
    expect(unconfigured.getPublicId(OWN_URL('abc'))).toBeNull();
  });
});

describe('CloudinaryService.deleteUnusedImages', () => {
  const destroy = vi.mocked(cloudinary.uploader.destroy);
  let productModel: ReturnType<typeof emptyModel>;
  let orderModel: ReturnType<typeof emptyModel>;
  let service: CloudinaryService;

  beforeEach(() => {
    destroy.mockReset();
    destroy.mockResolvedValue({ result: 'ok' });
    productModel = emptyModel();
    orderModel = emptyModel();
    service = createService(configured, {
      product: productModel,
      order: orderModel,
    });
  });

  it('xóa ảnh không còn được tham chiếu', async () => {
    const result = await service.deleteUnusedImages([OWN_URL('a')]);

    expect(destroy).toHaveBeenCalledOnce();
    expect(result.deleted).toEqual([OWN_URL('a')]);
  });

  it('giữ ảnh mà đơn hàng cũ còn dùng', async () => {
    orderModel.distinct.mockResolvedValue([OWN_URL('a')]);

    const result = await service.deleteUnusedImages([
      OWN_URL('a'),
      OWN_URL('b'),
    ]);

    expect(destroy).toHaveBeenCalledOnce();
    expect(result.deleted).toEqual([OWN_URL('b')]);
  });

  it('giữ ảnh mà sản phẩm khác còn dùng', async () => {
    productModel.distinct.mockResolvedValue([OWN_URL('a')]);

    const result = await service.deleteUnusedImages([OWN_URL('a')]);

    expect(destroy).not.toHaveBeenCalled();
    expect(result.deleted).toEqual([]);
  });

  it('xóa video với đúng loại tài nguyên', async () => {
    await service.deleteUnusedImages([OWN_VIDEO_URL('clip')]);

    expect(destroy).toHaveBeenCalledWith('e-commerce/clip', {
      resource_type: 'video',
      invalidate: true,
    });
  });

  it('không đụng tới ảnh ngoài hệ thống và không truy vấn database', async () => {
    const result = await service.deleteUnusedImages([
      'https://example.com/a.jpg',
    ]);

    expect(productModel.distinct).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(result.deleted).toEqual([]);
  });

  it('không xóa gì khi không kiểm tra được tham chiếu', async () => {
    orderModel.distinct.mockRejectedValue(new Error('mất kết nối'));

    const result = await service.deleteUnusedImages([OWN_URL('a')]);

    expect(destroy).not.toHaveBeenCalled();
    expect(result.deleted).toEqual([]);
  });

  it('lỗi từ Cloudinary không làm hỏng thao tác chính', async () => {
    destroy.mockRejectedValueOnce(new Error('lỗi mạng'));

    const result = await service.deleteUnusedImages([
      OWN_URL('a'),
      OWN_URL('b'),
    ]);

    expect(result.deleted).toEqual([OWN_URL('b')]);
  });
});

describe('CloudinaryService.createVideoUploadSignature', () => {
  it('ký upload vào thư mục của hệ thống và chỉ cho định dạng video', () => {
    const signature = createService(configured).createVideoUploadSignature();

    expect(signature.uploadUrl).toBe(
      'https://api.cloudinary.com/v1_1/demo/video/upload',
    );
    expect(signature.public_id).toMatch(/^e-commerce\//);
    expect(signature.allowed_formats).toBe('mp4,webm,mov');
    expect(signature.signature).toBe('signed');
    expect(cloudinary.utils.api_sign_request).toHaveBeenCalledWith(
      {
        timestamp: signature.timestamp,
        public_id: signature.public_id,
        allowed_formats: signature.allowed_formats,
      },
      'secret',
    );
  });

  it('báo lỗi khi chưa cấu hình Cloudinary', () => {
    const unconfigured = createService({
      get: () => undefined,
    } as unknown as ConfigService);
    expect(() => unconfigured.createVideoUploadSignature()).toThrow(
      'Hệ thống chưa cấu hình Cloudinary',
    );
  });
});
