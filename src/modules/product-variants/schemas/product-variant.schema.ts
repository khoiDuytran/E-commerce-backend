import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type ProductVariantDocument = HydratedDocument<ProductVariant>;

@Schema({ timestamps: true })
export class ProductVariant {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ required: true, trim: true, unique: true })
  sku: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Object, required: true, default: {} })
  attributes: Record<string, string>;

  // Giá bán
  @Prop({ required: true, min: 0 })
  price: number;

  // Giá trước giảm để hiển thị giá gạch ngang; tiền đơn hàng luôn tính theo price
  @Prop({ min: 0 })
  originalPrice?: number;

  // Giá nhập (giá vốn): chỉ admin xem qua endpoint admin/all.
  // select: false để không lộ ra API public, populate hay đơn hàng
  @Prop({ min: 0, select: false })
  costPrice?: number;

  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: true })
  isActive: boolean;
}

export const ProductVariantSchema =
  SchemaFactory.createForClass(ProductVariant);

ProductVariantSchema.index({ product: 1, name: 1 }, { unique: true });
ProductVariantSchema.index({ product: 1, isActive: 1 });
