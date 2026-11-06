import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../../auth/passport/roles.guard.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { Roles } from '../../decorator/customize.js';
import { DeleteImagesDto } from './dto/delete-images.dto.js';
import { CloudinaryService } from './cloudinary.service.js';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];

@Controller('cloudinary')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('images')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
      fileFilter: (_req, file, callback) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException('Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc AVIF'),
            false,
          );
        }
      },
    }),
  )
  uploadImage(@UploadedFile() file?: { buffer: Buffer }) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh cần tải lên');
    }
    return this.cloudinaryService.uploadImage(file.buffer);
  }

  @Post('videos/signature')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  createVideoUploadSignature() {
    return this.cloudinaryService.createVideoUploadSignature();
  }

  @Delete('images')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteImages(@Body() dto: DeleteImagesDto) {
    return this.cloudinaryService.deleteUnusedImages(dto.urls);
  }
}
