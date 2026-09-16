import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { validateObjectIdHelper } from '../../helpers/utils.js';
import { CartItemDto, CreateCartDto } from './dto/create-cart.dto.js';
import { Cart, CartDocument } from './schemas/cart.schema.js';
import { Product, ProductDocument } from '../product/schemas/product.schema.js';
import { UpdateCartDto } from './dto/update-cart.dto.js';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name)
    private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private async getOrCreateCart(userId: string) {
    validateObjectIdHelper(userId);

    let cart = await this.cartModel.findOne({ user: userId });
    if (!cart) {
      cart = await this.cartModel.create({ user: userId, items: [] });
    }

    return cart;
  }

  private async validateProductStock(productId: string, quantity: number) {
    validateObjectIdHelper(productId);

    const product = await this.productModel.findById(productId);
    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    if (!product.isActive) {
      throw new BadRequestException('Sản phẩm hiện không được mở bán');
    }

    if (product.stock < quantity) {
      throw new BadRequestException(
        `Số lượng đặt vượt quá tồn kho hiện có (${product.stock})`,
      );
    }

    return product;
  }

  async findByUser(userId: string) {
    const cart = await this.cartModel
      .findOne({ user: userId })
      .populate('items.product');

    return {
      user: userId,
      items: cart?.items ?? [],
    };
  }

  async addItem(userId: string, itemDto: CartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const product = await this.validateProductStock(
      itemDto.product,
      itemDto.quantity,
    );

    const existedItem = cart.items.find(
      (item) => item.product?.toString() === itemDto.product,
    );

    if (existedItem) {
      const newQuantity = existedItem.quantity + itemDto.quantity;
      if (product.stock < newQuantity) {
        throw new BadRequestException(
          `Số lượng đặt vượt quá tồn kho hiện có (${product.stock})`,
        );
      }

      existedItem.quantity = newQuantity;
      existedItem.priceAtAdd = product.basePrice;
    } else {
      cart.items.push({
        product: new Types.ObjectId(itemDto.product),
        quantity: itemDto.quantity,
        priceAtAdd: product.basePrice,
      });
    }

    await cart.save();

    return {
      message: 'Thêm sản phẩm vào giỏ hàng thành công',
      cart,
    };
  }

  async updateItem(userId: string, updateCartDto: UpdateCartDto) {
    const { product, quantity } = updateCartDto;
    validateObjectIdHelper(product);

    if (!quantity || quantity <= 0) {
      return this.removeItem(userId, product);
    }

    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find(
      (cartItem) => cartItem.product?.toString() === product,
    );

    if (!item) {
      throw new NotFoundException('Sản phẩm không có trong giỏ hàng');
    }

    await this.validateProductStock(product, quantity);

    item.quantity = quantity;
    await cart.save();

    return {
      message: 'Cập nhật số lượng sản phẩm trong giỏ hàng thành công',
      cart,
    };
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.getOrCreateCart(userId);
    const itemExists = cart.items.some(
      (item) => item.product.toString() === productId,
    );

    if (!itemExists) {
      throw new NotFoundException('Sản phẩm không có trong giỏ hàng');
    }

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId,
    );
    await cart.save();

    return {
      message: 'Xóa sản phẩm khỏi giỏ hàng thành công',
      cart,
    };
  }

  async clear(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    cart.items = [];
    await cart.save();

    return {
      message: 'Xóa toàn bộ giỏ hàng thành công',
      cart,
    };
  }

  async create(createCartDto: CreateCartDto) {
    const cart = await this.getOrCreateCart(createCartDto.user ?? '');

    if (createCartDto.items?.length) {
      for (const item of createCartDto.items) {
        await this.addItem(cart.user.toString(), item);
      }
    }

    return this.findByUser(cart.user.toString());
  }
}
