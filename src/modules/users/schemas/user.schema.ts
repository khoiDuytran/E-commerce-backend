import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IsEmail } from 'class-validator';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../../../common/enums/user-role.enum.js';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop()
  name: string;

  @Prop()
  @IsEmail()
  email: string;

  @Prop()
  password: string;

  @Prop()
  phone: string;

  @Prop()
  address: string;

  @Prop()
  image: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ default: 'LOCAL' })
  accountType: string;

  @Prop({ default: false })
  isActive: boolean;

  // Khác isActive (chưa xác thực email): tài khoản bị khóa không tự mở lại được bằng mã kích hoạt
  @Prop({ default: false })
  isDisabled: boolean;

  // Ai đã khóa tài khoản: chỉ SELF mới được tự khôi phục qua email
  @Prop({ type: String, enum: ['SELF', 'ADMIN', null], default: null })
  disabledBy: 'SELF' | 'ADMIN' | null;

  @Prop()
  codeId: string;

  @Prop()
  codeExpired: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
