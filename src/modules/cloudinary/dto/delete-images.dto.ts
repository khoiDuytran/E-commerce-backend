import { ArrayMaxSize, IsArray, IsUrl } from 'class-validator';

export class DeleteImagesDto {
  @IsArray({ message: 'Danh sách ảnh không hợp lệ' })
  @ArrayMaxSize(50, { message: 'Chỉ được xóa tối đa 50 ảnh mỗi lần' })
  @IsUrl({}, { each: true, message: 'URL ảnh không hợp lệ' })
  urls: string[];
}
