import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import {
  UpdateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/update-user.dto.js';
import aqp from 'api-query-params';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema.js';
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
import { UserRole } from '../../common/enums/user-role.enum.js';
import { RefreshTokensService } from '../refresh-tokens/refresh-tokens.service.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private readonly mailerService: MailerService,
    private readonly refreshTokensService: RefreshTokensService,
  ) {}

  async isEmailExist(email: string): Promise<boolean> {
    return !!(await this.userModel.exists({ email }));
  }

  async create(createUserDto: CreateUserDto) {
    const { name, email, password, role } = createUserDto;

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
      role: role ?? UserRole.USER,
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
      role: UserRole.USER,
      isActive: false,
      codeId: codeId,
      codeExpired: dayjs().add(5, 'minutes').toDate(),
    });

    //send mail
    // Tài khoản đã tạo xong: lỗi gửi mail không làm hỏng đăng ký, user có thể gửi lại qua retry-active
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Activate your account at E-Commerce',
        template: 'register',
        context: {
          name: user?.name ?? user.email,
          activationCode: codeId,
        },
      });
    } catch (error) {
      console.error(`Gửi mail thất bại tới ${user.email}:`, error);
    }

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

    await this.sendAccountCode(
      user,
      'Đặt lại mật khẩu tài khoản E-commerce',
      'Đặt lại mật khẩu',
      'Bạn đã yêu cầu đặt lại mật khẩu.',
    );
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

      // Mật khẩu đã đổi xong: lỗi gửi mail thông báo không làm hỏng việc đổi mật khẩu
      try {
        await this.mailerService.sendMail({
          to: user.email,
          subject: 'Mật khẩu tài khoản E-commerce đã được thay đổi',
          template: 'password-changed',
          context: {
            name: user.name ?? user.email,
            changedAt: dayjs().format('HH:mm DD/MM/YYYY'),
          },
        });
      } catch (error) {
        console.error(`Gửi mail thất bại tới ${user.email}:`, error);
      }

      return { isBeforeCheck, userId: user._id.toString() };
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

  // Chỉ lấy field hiển thị được cho chính user: không trả mật khẩu và mã xác thực
  async findProfile(id: string) {
    validateObjectIdHelper(id);

    const user = await this.userModel
      .findById(id)
      .select('name email phone address image role');
    if (!user) {
      throw new NotFoundException('Không tìm thấy user');
    }
    return user;
  }

  async updateRole(updateUserRoleDto: UpdateUserRoleDto, requesterId: string) {
    const { _id, role } = updateUserRoleDto;
    // Chặn hạ quyền admin: nếu không, admin có thể hạ quyền rồi xóa/khóa admin khác
    await this.findModeratableUser(_id, requesterId);

    const updated = await this.userModel
      .findByIdAndUpdate(
        _id,
        { role },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .select('-password');

    if (!updated) {
      throw new NotFoundException('Không tìm thấy user');
    }

    return { message: 'Cập nhật user-role thành công', user: updated };
  }

  async update(
    updateUserDto: UpdateUserDto,
    requesterId: string,
    isAdmin: boolean,
  ) {
    const targetId = isAdmin ? updateUserDto._id : requesterId;
    const { _id: _ignoredId, ...updateData } = updateUserDto;
    validateObjectIdHelper(targetId);

    const forbiddenFields = [
      'password',
      'codeId',
      'codeExpired',
      'isActive',
      'isDisabled',
      'email',
    ];
    for (const field of forbiddenFields) {
      if (field in updateData) {
        delete updateData[field];
      }
    }

    const updated = await this.userModel
      .findByIdAndUpdate(
        targetId,
        { ...updateData },
        { returnDocument: 'after', runValidators: true },
      )
      .select('-password');

    if (!updated) {
      throw new NotFoundException('Không tìm thấy user');
    }

    return { message: 'Cập nhật user thành công', user: updated };
  }

  // Admin khóa hoặc mở khóa tài khoản người khác
  async updateStatus(dto: UpdateUserStatusDto, requesterId: string) {
    const { _id, isDisabled } = dto;
    validateObjectIdHelper(_id);
    // Mở khóa không nguy hiểm nên chỉ kiểm tra khi khóa
    if (isDisabled) {
      await this.findModeratableUser(_id, requesterId);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(
        _id,
        { isDisabled, disabledBy: isDisabled ? 'ADMIN' : null },
        { returnDocument: 'after' },
      )
      .select('-password');
    if (!updated) {
      throw new NotFoundException('Không tìm thấy user');
    }
    if (isDisabled) {
      // Thu hồi refresh token để phiên hiện tại không làm mới được nữa
      await this.refreshTokensService.revokeAllForUser(_id);
    }

    return {
      message: isDisabled
        ? 'Vô hiệu hóa tài khoản thành công'
        : 'Mở khóa tài khoản thành công',
      user: updated,
    };
  }

  // Tạo mã mới cho user và gửi qua email; lỗi gửi mail thì báo để user thử lại
  private async sendAccountCode(
    user: UserDocument,
    subject: string,
    title: string,
    intro: string,
  ) {
    const code = uuidv4();
    await user.updateOne({
      codeId: code,
      codeExpired: dayjs().add(5, 'minutes').toDate(),
    });
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject,
        template: 'account-code',
        context: { name: user.name ?? user.email, title, intro, code },
      });
    } catch (error) {
      console.error(`Gửi mail thất bại tới ${user.email}:`, error);
      throw new BadRequestException(
        'Không thể gửi email xác nhận lúc này. Vui lòng thử lại sau.',
      );
    }
  }

  private isValidCode(user: UserDocument, code: string) {
    return (
      !!user.codeId &&
      user.codeId === code.trim() &&
      dayjs().isBefore(user.codeExpired)
    );
  }

  // Chặn admin tự khóa để hệ thống không rơi vào cảnh không còn ai quản trị
  private async findSelfDisableUser(userId: string) {
    validateObjectIdHelper(userId);
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy user');
    }
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Tài khoản quản trị viên không thể tự vô hiệu hóa.',
      );
    }
    return user;
  }

  // Bước 1 tự khóa: user phải nhập đúng email đăng ký của tài khoản đang đăng nhập
  async requestDisableCode(userId: string, email: string) {
    const user = await this.findSelfDisableUser(userId);
    if (user.email.toLowerCase() !== email.trim().toLowerCase()) {
      throw new BadRequestException(
        'Email không khớp với email đăng ký của tài khoản.',
      );
    }

    await this.sendAccountCode(
      user,
      'Xác nhận vô hiệu hóa tài khoản E-commerce',
      'Vô hiệu hóa tài khoản',
      'Bạn đã yêu cầu vô hiệu hóa tài khoản.',
    );
    return { email: user.email };
  }

  // Bước 2 tự khóa: đúng mã thì khóa và đăng xuất mọi phiên
  async disableSelf(userId: string, code: string) {
    const user = await this.findSelfDisableUser(userId);
    if (!this.isValidCode(user, code)) {
      throw new BadRequestException('Mã code không hợp lệ hoặc đã hết hạn');
    }

    // Xóa mã sau khi dùng để không dùng lại được
    await user.updateOne({
      isDisabled: true,
      disabledBy: 'SELF',
      codeId: null,
      codeExpired: null,
    });
    await this.refreshTokensService.revokeAllForUser(userId);
    return { message: 'Vô hiệu hóa tài khoản thành công' };
  }

  // Chỉ tài khoản tự khóa mới được tự khôi phục; bị admin khóa thì phải nhờ admin
  private async findRestorableUser(email: string) {
    const user = await this.userModel.findOne({ email: email.trim() });
    if (!user) {
      throw new NotFoundException('Tài khoản không tồn tại');
    }
    if (!user.isDisabled) {
      throw new BadRequestException('Tài khoản đang hoạt động bình thường');
    }
    if (user.disabledBy !== 'SELF') {
      throw new ForbiddenException(
        'Tài khoản đã bị quản trị viên vô hiệu hóa. Vui lòng liên hệ quản trị viên.',
      );
    }
    return user;
  }

  async requestRestoreCode(email: string) {
    const user = await this.findRestorableUser(email);
    await this.sendAccountCode(
      user,
      'Xác nhận khôi phục tài khoản E-commerce',
      'Khôi phục tài khoản',
      'Bạn đã yêu cầu khôi phục tài khoản.',
    );
    return { email: user.email };
  }

  async restoreAccount(email: string, code: string) {
    const user = await this.findRestorableUser(email);
    if (!this.isValidCode(user, code)) {
      throw new BadRequestException('Mã code không hợp lệ hoặc đã hết hạn');
    }
    await user.updateOne({
      isDisabled: false,
      disabledBy: null,
      codeId: null,
      codeExpired: null,
    });
    return { message: 'Khôi phục tài khoản thành công' };
  }

  // Admin không được xóa/khóa/đổi vai trò của chính mình hoặc admin khác. Admin thực
  // hiện thao tác luôn còn hoạt động nên hệ thống không bao giờ mất hết admin
  private async findModeratableUser(targetId: string, requesterId: string) {
    validateObjectIdHelper(targetId);
    if (targetId === String(requesterId)) {
      throw new BadRequestException(
        'Không thể thực hiện trên tài khoản của chính bạn.',
      );
    }
    const target = await this.userModel.findById(targetId).select('role');
    if (!target) {
      throw new NotFoundException('Không tìm thấy user');
    }
    if (target.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Không thể thực hiện trên tài khoản quản trị viên khác.',
      );
    }
    return target;
  }

  async getStats() {
    const startOfMonth = dayjs().startOf('month').toDate();
    const [total, admins, active, unverified, disabled, newThisMonth] =
      await Promise.all([
        this.userModel.countDocuments(),
        this.userModel.countDocuments({ role: UserRole.ADMIN }),
        this.userModel.countDocuments({
          isActive: true,
          isDisabled: { $ne: true },
        }),
        this.userModel.countDocuments({
          isActive: { $ne: true },
          isDisabled: { $ne: true },
        }),
        this.userModel.countDocuments({ isDisabled: true }),
        this.userModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
      ]);
    return { total, admins, active, unverified, disabled, newThisMonth };
  }

  async remove(_id: string, requesterId: string) {
    await this.findModeratableUser(_id, requesterId);
    await this.userModel.deleteOne({ _id });
    // Xóa user thì phiên đăng nhập của user đó cũng phải mất hiệu lực
    await this.refreshTokensService.revokeAllForUser(_id);
    return { message: 'Xóa user thành công' };
  }
}
