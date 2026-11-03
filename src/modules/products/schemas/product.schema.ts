import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Document,
  HydratedDocument,
  Types,
  Schema as MongooseSchema,
} from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true })
  slug: string;

  @Prop()
  description?: string;

  @Prop()
  sizeGuide?: string;

  @Prop()
  detailsFit?: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Category',
    required: true,
  })
  category: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  images: string[];

  // Giá bán
  @Prop({ required: true, min: 0 })
  basePrice: number;

  // Giá trước giảm để hiển thị giá gạch ngang; tiền đơn hàng luôn tính theo basePrice
  @Prop({ min: 0 })
  originalPrice?: number;

  // Giá nhập (giá vốn): chỉ admin xem qua endpoint admin/all.
  // select: false để không lộ ra API public, populate hay đơn hàng
  @Prop({ min: 0, select: false })
  costPrice?: number;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: 0 })
  soldCount: number;

  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
