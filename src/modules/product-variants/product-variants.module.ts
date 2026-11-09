import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProductVariantsController } from './product-variants.controller.js';
import { ProductVariantsService } from './product-variants.service.js';
import {
  ProductVariant,
  ProductVariantSchema,
} from './schemas/product-variant.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { Order, OrderSchema } from '../orders/schemas/order.schema.js';

@Module({
  imports: [
    NotificationsModule,
    CloudinaryModule,
    MongooseModule.forFeature([
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: Product.name, schema: ProductSchema },
      // Chỉ để kiểm tra biến thể đã có đơn hàng trước khi xoá
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [ProductVariantsController],
  providers: [ProductVariantsService],
  exports: [ProductVariantsService],
})
export class ProductVariantsModule {}
