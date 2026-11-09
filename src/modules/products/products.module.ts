import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProductController } from './products.controller.js';
import { ProductService } from './products.service.js';
import { Product, ProductSchema } from './schemas/product.schema.js';
import {
  Category,
  CategorySchema,
} from '../categories/schemas/category.schema.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../product-variants/schemas/product-variant.schema.js';
import { Order, OrderSchema } from '../orders/schemas/order.schema.js';
import {
  Wishlist,
  WishlistSchema,
} from '../wishlist/schemas/wishlist.schema.js';

@Module({
  imports: [
    NotificationsModule,
    CloudinaryModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      // Dùng khi xoá sản phẩm: kiểm tra đơn hàng và dọn wishlist
      { name: Order.name, schema: OrderSchema },
      { name: Wishlist.name, schema: WishlistSchema },
    ]),
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
