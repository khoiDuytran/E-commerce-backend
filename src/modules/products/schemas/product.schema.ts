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

// Cửa hàng luôn lọc isActive=true, có hoặc không kèm category, và sắp theo mới nhất hoặc giá.
// Thứ tự trường theo quy tắc Equality → Sort để Mongo sắp xếp bằng index thay vì sort trong bộ nhớ.
// Sort ngược (-basePrice) vẫn dùng được index nhờ Mongo duyệt index theo chiều ngược lại.
ProductSchema.index({ isActive: 1, category: 1, createdAt: -1 });
ProductSchema.index({ isActive: 1, category: 1, basePrice: 1 });
ProductSchema.index({ isActive: 1, createdAt: -1 });
ProductSchema.index({ isActive: 1, basePrice: 1 });
