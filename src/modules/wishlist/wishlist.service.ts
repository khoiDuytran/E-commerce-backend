import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { validateObjectIdHelper } from '../../helpers/utils.js';
import { CreateWishlistDto } from './dto/create-wishlist.dto.js';
import { UpdateWishlistDto } from './dto/update-wishlist.dto.js';
import { Wishlist, WishlistDocument } from './schemas/wishlist.schema.js';
import {
  Product,
  ProductDocument,
} from '../products/schemas/product.schema.js';

@Injectable()
export class WishlistService {
  constructor(
    @InjectModel(Wishlist.name)
    private readonly wishlistModel: Model<WishlistDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private async getOrCreateWishlist(userId: string) {
    validateObjectIdHelper(userId);

    let wishlist = await this.wishlistModel.findOne({ user: userId });
    if (!wishlist) {
      wishlist = await this.wishlistModel.create({
        user: userId,
        products: [],
      });
    }

    return wishlist;
  }

  async findByUser(userId: string) {
    const wishlist = await this.wishlistModel
      .findOne({ user: userId })
      .populate('products');

    return {
      user: userId,
      products: wishlist?.products ?? [],
    };
  }

  async addProduct(userId: string, createWishlistDto: CreateWishlistDto) {
    validateObjectIdHelper(createWishlistDto.product);

    const product = await this.productModel.findById(createWishlistDto.product);
    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    const wishlist = await this.getOrCreateWishlist(userId);
    const alreadyExists = wishlist.products.some(
      (wishlistProduct) =>
        wishlistProduct.toString() === createWishlistDto.product,
    );

    if (alreadyExists) {
      return {
        message: 'Sản phẩm đã có trong danh sách yêu thích',
        wishlist,
      };
    }

    wishlist.products.push(new Types.ObjectId(createWishlistDto.product));
    await wishlist.save();

    return {
      message: 'Thêm sản phẩm vào danh sách yêu thích thành công',
      wishlist,
    };
  }

  async removeProduct(userId: string, productId: string) {
    validateObjectIdHelper(productId);

    const wishlist = await this.getOrCreateWishlist(userId);
    const productExists = wishlist.products.some(
      (product) => product.toString() === productId,
    );

    if (!productExists) {
      throw new NotFoundException(
        'Sản phẩm không có trong danh sách yêu thích',
      );
    }

    wishlist.products = wishlist.products.filter(
      (product) => product.toString() !== productId,
    );
    await wishlist.save();

    return {
      message: 'Xóa sản phẩm khỏi danh sách yêu thích thành công',
      wishlist,
    };
  }

  async clear(userId: string) {
    const wishlist = await this.getOrCreateWishlist(userId);
    wishlist.products = [];
    await wishlist.save();

    return {
      message: 'Xóa toàn bộ danh sách yêu thích thành công',
      wishlist,
    };
  }

  async update(userId: string, updateWishlistDto: UpdateWishlistDto) {
    const productIds = updateWishlistDto.products;
    const productCount = await this.productModel.countDocuments({
      _id: { $in: productIds },
    });

    if (productCount !== new Set(productIds).size) {
      throw new NotFoundException('Một hoặc nhiều sản phẩm không tồn tại');
    }

    const wishlist = await this.getOrCreateWishlist(userId);
    wishlist.products = productIds.map(
      (productId) => new Types.ObjectId(productId),
    );
    await wishlist.save();

    return {
      message: 'Cập nhật danh sách yêu thích thành công',
      wishlist,
    };
  }
}
