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
import {
  Product,
  ProductDocument,
} from '../products/schemas/product.schema.js';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../product-variants/schemas/product-variant.schema.js';
import { UpdateCartDto } from './dto/update-cart.dto.js';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name)
    private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name)
    private readonly productVariantModel: Model<ProductVariantDocument>,
  ) {}

  private async getOrCreateCart(userId: string) {
    validateObjectIdHelper(userId);

    let cart = await this.cartModel.findOne({ user: userId });
    if (!cart) {
      cart = await this.cartModel.create({ user: userId, items: [] });
    }

    return cart;
  }

  private async validateProductStock(
    productId: string,
    variantId: string | undefined,
    quantity: number,
  ) {
    validateObjectIdHelper(productId);

    const product = await this.productModel.findById(productId);
    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    if (!product.isActive) {
      throw new BadRequestException('Sản phẩm hiện không được mở bán');
    }

    if (variantId) {
      validateObjectIdHelper(variantId);
      const variant = await this.productVariantModel.findOne({
        _id: variantId,
        product: productId,
        isActive: true,
      });
      if (!variant) {
        throw new NotFoundException('Biến thể sản phẩm không tồn tại');
      }
      if (variant.stock < quantity) {
        throw new BadRequestException(
          `Số lượng đặt vượt quá tồn kho biến thể hiện có (${variant.stock})`,
        );
      }
      return { product, variant, price: variant.price };
    }

    if (product.stock < quantity) {
      throw new BadRequestException(
        `Số lượng đặt vượt quá tồn kho hiện có (${product.stock})`,
      );
    }

    return { product, price: product.basePrice };
  }

  async findByUser(userId: string) {
    const cart = await this.cartModel
      .findOne({ user: userId })
      .populate('items.product')
      .populate('items.variant');

    return {
      user: userId,
      items: cart?.items ?? [],
    };
  }

  async addItem(userId: string, itemDto: CartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const itemData = await this.validateProductStock(
      itemDto.product,
      itemDto.variant,
      itemDto.quantity,
    );

    const existedItem = cart.items.find(
      (item) =>
        item.product?.toString() === itemDto.product &&
        item.variant?.toString() === (itemDto.variant ?? undefined),
    );

    if (existedItem) {
      const newQuantity = existedItem.quantity + itemDto.quantity;
      await this.validateProductStock(
        itemDto.product,
        itemDto.variant,
        newQuantity,
      );

      existedItem.quantity = newQuantity;
      existedItem.priceAtAdd = itemData.price;
    } else {
      cart.items.push({
        product: new Types.ObjectId(itemDto.product),
        variant: itemDto.variant
          ? new Types.ObjectId(itemDto.variant)
          : undefined,
        quantity: itemDto.quantity,
        priceAtAdd: itemData.price,
      });
    }

    await cart.save();

    return {
      message: 'Thêm sản phẩm vào giỏ hàng thành công',
      cart,
    };
  }

  async updateItem(userId: string, updateCartDto: UpdateCartDto) {
    const { product, variant, quantity } = updateCartDto;
    validateObjectIdHelper(product);

    if (!quantity || quantity <= 0) {
      return this.removeItem(userId, product, variant);
    }

    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find(
      (cartItem) =>
        cartItem.product?.toString() === product &&
        cartItem.variant?.toString() === (variant ?? undefined),
    );

    if (!item) {
      throw new NotFoundException('Sản phẩm không có trong giỏ hàng');
    }

    const itemData = await this.validateProductStock(
      product,
      variant,
      quantity,
    );

    item.quantity = quantity;
    item.priceAtAdd = itemData.price;
    await cart.save();

    return {
      message: 'Cập nhật số lượng sản phẩm trong giỏ hàng thành công',
      cart,
    };
  }

  async removeItem(userId: string, productId: string, variantId?: string) {
    validateObjectIdHelper(productId);
    if (variantId) validateObjectIdHelper(variantId);

    const cart = await this.getOrCreateCart(userId);
    const itemExists = cart.items.some(
      (item) =>
        item.product.toString() === productId &&
        item.variant?.toString() === (variantId ?? undefined),
    );

    if (!itemExists) {
      throw new NotFoundException('Sản phẩm không có trong giỏ hàng');
    }

    cart.items = cart.items.filter(
      (item) =>
        !(
          item.product.toString() === productId &&
          item.variant?.toString() === (variantId ?? undefined)
        ),
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
