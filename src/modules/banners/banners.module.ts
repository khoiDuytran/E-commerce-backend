import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { BannersController } from './banners.controller.js';
import { BannersService } from './banners.service.js';
import { Banner, BannerSchema } from './schemas/banner.schema.js';

@Module({
  imports: [
    CloudinaryModule,
    MongooseModule.forFeature([{ name: Banner.name, schema: BannerSchema }]),
  ],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
