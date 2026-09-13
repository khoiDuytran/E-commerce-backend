import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductController } from './product.controller.js';
import { ProductService } from './product.service.js';
import { Product, ProductSchema } from './schemas/product.schema.js';
import {
  Category,
  CategorySchema,
} from '../category/schemas/category.schema.js';
import { Brand, BrandSchema } from '../brand/schemas/brand.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Brand.name, schema: BrandSchema },
    ]),
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
