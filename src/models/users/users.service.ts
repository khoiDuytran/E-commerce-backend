import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import aqp from 'api-query-params';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schemas/user.schema.js';
import { Model } from 'mongoose';
import {
  hashPasswordHelper,
  validateObjectIdHelper,
} from '../../helpers/utils.js';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { CreateAuthDto } from '../../auth/dto/create-auth.dto.js';
import { MailerService } from '@nestjs-modules/mailer';
import { CodeAuthDto } from '../../auth/dto/code-auth.dto.js';
import { ChangePasswordAuthDto } from '../../auth/dto/change-password.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private readonly mailerService: MailerService,
  ) {}

  async isEmailExist(email: string): Promise<boolean> {
    return !!(await this.userModel.exists({ email }));
  }

  async create(createUserDto: CreateUserDto) {
    const { name, email, password } = createUserDto;

    //check email
    const isExist = await this.isEmailExist(email);
    if (isExist) {
      throw new BadRequestException(
        `Email đã tồn tại: ${email}. Vui lòng sử dụng email khác.`,
      );
    }

    const hashPassword = await hashPasswordHelper(password);
    const user = await this.userModel.create({
      name,
      email,
      password: hashPassword,
    });
    return {
      message: 'Tạo user thành công',
      user,
    };
  }

  async register(registerDto: CreateAuthDto) {
    const { email, name, password } = registerDto;

    //check mail
    const isExist = await this.isEmailExist(email);
    if (isExist) {
      throw new BadRequestException(
        `Email đã tồn tại: ${email}. Vui lòng sử dụng email khác.`,
      );
    }

    //hashPassword
    const hashPassword = await hashPasswordHelper(password);
    const codeId = uuidv4();
    const user = await this.userModel.create({
      name,
      email,
      password: hashPassword,
      isActive: false,
      codeId: codeId,
      codeExpired: dayjs().add(5, 'minutes').toDate(),
    });

    //send mail
    this.mailerService.sendMail({
      to: user.email,
      subject: 'Activate your account at E-Commerce',
      template: 'register',
      context: {
        name: user?.name ?? user.email,
        activationCode: codeId,
      },
    });

    return {
      _id: user._id,
    };
  }

  async handleActive(codeAuthDto: CodeAuthDto) {
    const user = await this.userModel.findOne({
      _id: codeAuthDto._id,
      codeId: codeAuthDto.code,
    });
    if (!user) {
      throw new NotFoundException('Mã code không hợp lệ hoặc đã hết hạn');
    }

    //check expire code
    const isBeforeCheck = dayjs().isBefore(user.codeExpired);

    if (isBeforeCheck) {
      //valid => update user
      await user.updateOne({
        isActive: true,
      });

      return { isBeforeCheck };
    } else {
      throw new BadRequestException('Mã code không hợp lệ hoặc đã hết hạn');
    }
  }

  async retryActive(email: string) {
    //check mail
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('Tài khoản không tồn tại');
    }
    if (user.isActive) {
      throw new BadRequestException('Tài khoản đã được kích hoạt');
    }

    //send email
    const codeId = uuidv4();
    //update user
    await user.updateOne({
      codeId: codeId,
      codeExpired: dayjs().add(5, 'minutes').toDate(),
    });

    //send email
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Activate your account at E-commerce',
        template: 'register',
        context: {
          name: user?.name ?? user.email,
          activationCode: codeId,
        },
      });
    } catch (error) {
      console.error(`Gửi mail thất bại tới ${user.email}:`, error);
      throw new BadRequestException(
        'Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.',
      );
    }

    return { _id: user._id };
  }

  async retryPassword(email: string) {
    //check mail
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('Tài khoản không tồn tại');
    }

    //send Email
    const codeId = uuidv4();

    //update user
    await user.updateOne({
      codeId: codeId,
      codeExpired: dayjs().add(5, 'minutes').toDate(),
    });

    //send email
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Change your password account at E-commerce',
        template: 'register',
        context: {
          name: user?.name ?? user.email,
          activationCode: codeId,
        },
      });
    } catch (error) {
      console.error(`Gửi mail thất bại tới ${user.email}:`, error);
      throw new BadRequestException(
        'Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.',
      );
    }
    return { _id: user._id, email: user.email };
  }

  async changePassword(data: ChangePasswordAuthDto) {
    if (data.confirmPassword !== data.password) {
      throw new BadRequestException(
        'Mật khẩu và xác nhận mật khẩu không chính xác.',
      );
    }

    //check email
    const user = await this.userModel.findOne({
      email: data.email,
      codeId: data.code,
    });

    if (!user) {
      throw new BadRequestException('Mã code không hợp lệ hoặc đã hết hạn');
    }

    //check expire code
    const isBeforeCheck = dayjs().isBefore(user.codeExpired);

    if (isBeforeCheck) {
      //valid => update password
      const newPassword = await hashPasswordHelper(data.password);
      await user.updateOne({
        password: newPassword,
        codeId: null,
        codeExpired: null,
      });
      return { isBeforeCheck };
    } else {
      throw new BadRequestException('Mã code không hợp lệ hoặc đã hết hạn');
    }
  }

  async findAll(query: string, current: number, pageSize: number) {
    const { filter, sort } = aqp(query);
    if (filter.current) delete filter.current;
    if (filter.pageSize) delete filter.pageSize;

    if (!current) current = 1;
    if (!pageSize) pageSize = 10;

    const totalItems = await this.userModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);

    const skip = (current - 1) * pageSize;

    const results = await this.userModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .select('-password')
      .sort(sort as any);

    return {
      meta: {
        current: current, //trang hiện tại
        pageSize: pageSize, //số lượng bản ghi đã lấy
        pages: totalPages, //tổng số trang với điều kiện query
        total: totalItems, // tổng số phần tử (số bản ghi)
      },
      results, //kết quả query
    };
  }

  async findByEmail(email: string) {
    return await this.userModel.findOne({ email });
  }

  async findById(id: string) {
    validateObjectIdHelper(id);

    const user = await this.userModel.findById(id).select('-password');
    if (!user) {
      throw new NotFoundException('Không tìm thấy user');
    }
    return user;
  }

  async update(updateUserDto: UpdateUserDto) {
    const { _id, ...updateData } = updateUserDto as any;
    validateObjectIdHelper(_id);

    const forbiddenFields = [
      'password',
      'codeId',
      'codeExpired',
      'isActive',
      'email',
    ];
    for (const field of forbiddenFields) {
      if (field in updateData) {
        delete updateData[field];
      }
    }

    const updated = await this.userModel
      .findByIdAndUpdate(
        _id,
        { ...updateData },
        { returnDocument: 'after', runValidators: true },
      )
      .select('-password');

    if (!updated) {
      throw new NotFoundException('Không tìm thấy user');
    }

    return { message: 'Cập nhật user thành công', user: updated };
  }

  async remove(_id: string) {
    validateObjectIdHelper(_id);
    return this.userModel.deleteOne({ _id });
  }
}
