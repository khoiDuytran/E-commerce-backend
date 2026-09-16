import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CartService } from './cart.service.js';
import { CartController } from './cart.controller.js';
import { Cart, CartSchema } from './schemas/cart.schema.js';
import { Product, ProductSchema } from '../product/schemas/product.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cart.name, schema: CartSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
