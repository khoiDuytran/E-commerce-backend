import { IsEnum, IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum.js';

export class UpdateUserDto {
  @IsMongoId({ message: '_id không hợp lệ' })
  @IsNotEmpty({ message: '_id không được để trống' })
  _id: string;

  @IsOptional()
  name: string;

  @IsOptional()
  phone: string;

  @IsOptional()
  address: string;

  @IsOptional()
  image: string;
}

export class UpdateUserRoleDto {
  @IsMongoId({ message: '_id không hợp lệ' })
  @IsNotEmpty({ message: '_id không được để trống' })
  _id: string;

  @IsEnum(UserRole, { message: 'UserRole không hợp lệ' })
  role: UserRole;
}
