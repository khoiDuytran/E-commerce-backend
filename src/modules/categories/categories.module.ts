import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoryService } from './categories.service.js';
import { CategoryController } from './categories.controller.js';
import { Category, CategorySchema } from './schemas/category.schema.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import {
  Product,
  ProductSchema,
} from '../products/schemas/product.schema.js';

@Module({
  imports: [
    CloudinaryModule,
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      // Chỉ để kiểm tra danh mục còn sản phẩm trước khi xoá
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
