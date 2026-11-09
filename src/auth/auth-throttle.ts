import { Throttle } from '@nestjs/throttler';

const MINUTE = 60_000;

export const THROTTLE_ERROR_MESSAGE =
  'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.';

// Mức mặc định cho route auth không khai báo riêng
export const DEFAULT_AUTH_THROTTLE = { ttl: MINUTE, limit: 20 };

// Đếm theo IP. Chỉ dùng cho route mà trình duyệt gọi thẳng tới backend
const byIp = (limit: number, ttl: number, blockDuration?: number) =>
  Throttle({ default: { limit, ttl, blockDuration } });

/**
 * Login được gọi từ server Next.js (authorize của NextAuth), nên mọi khách đều có
 * chung IP của server Next. Vì vậy đếm theo email để chặn dò mật khẩu từng tài khoản
 * mà không khóa nhầm toàn bộ người dùng.
 * Body chưa qua ValidationPipe ở bước guard nên phải tự kiểm tra kiểu.
 */
export const LoginThrottle = () =>
  Throttle({
    default: {
      limit: 5,
      ttl: MINUTE,
      blockDuration: 5 * MINUTE,
      getTracker: (req: Record<string, any>) => {
        const email: unknown = req.body?.email;
        return typeof email === 'string' && email.trim()
          ? `email:${email.trim().toLowerCase()}`
          : `ip:${req.ip}`;
      },
    },
  });

// Đăng ký từ trình duyệt: hạn chế tạo tài khoản rác hàng loạt
export const RegisterThrottle = () => byIp(5, 10 * MINUTE);

// Route gửi email: tránh bị dùng để spam hộp thư người khác và tốn hạn mức SMTP
export const SendMailThrottle = () => byIp(3, 5 * MINUTE);

// Route nhập mã xác thực: hạn chế dò mã
export const VerifyCodeThrottle = () => byIp(10, MINUTE, 5 * MINUTE);
