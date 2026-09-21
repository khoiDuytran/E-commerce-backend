# E-commerce Backend

Backend API cho hệ thống thương mại điện tử, được xây dựng bằng NestJS, TypeScript và MongoDB.

## Tính năng

- Đăng ký, đăng nhập bằng email/mật khẩu và xác thực JWT.
- Refresh token lưu trong HttpOnly cookie, có rotation và revoke khi logout.
- Phân quyền `USER` và `ADMIN`.
- Quản lý người dùng, thương hiệu, danh mục, sản phẩm và biến thể sản phẩm.
- Địa chỉ giao hàng, giỏ hàng và danh sách yêu thích.
- Tạo đơn hàng, áp dụng coupon và theo dõi trạng thái đơn hàng.
- Thanh toán COD và tích hợp VNPay Sandbox.
- Tạo và xử lý yêu cầu hoàn hàng.
- Gửi email kích hoạt tài khoản và các luồng email liên quan.
- Validation DTO bằng `class-validator` và chuẩn hóa response qua interceptor.

## Công nghệ

- Node.js
- NestJS 12
- TypeScript
- MongoDB và Mongoose
- Passport JWT / Passport Local
- VNPay Sandbox
- Nodemailer và Handlebars
- Vitest
- Oxlint

## Cấu trúc chính

```text
src/
├── auth/                  # Đăng nhập, đăng ký, JWT, refresh token
├── common/                # Enum dùng chung
├── core/                  # Interceptor và thành phần lõi
├── decorator/             # Public route, role và response metadata
├── helpers/               # Hàm tiện ích dùng chung
├── integrations/vnpay/    # Tích hợp VNPay
├── mail/templates/        # Template email Handlebars
└── modules/
    ├── addresses/
    ├── brands/
    ├── carts/
    ├── categories/
    ├── coupons/
    ├── orders/
    ├── payments/
    ├── product-variants/
    ├── products/
    ├── refunds/
    ├── refresh-tokens/
    ├── users/
    └── wishlist/
```

## Yêu cầu môi trường

- Node.js 20 trở lên.
- MongoDB đang chạy local hoặc một MongoDB URI có thể truy cập.
- Tài khoản SMTP nếu sử dụng chức năng email.
- Tài khoản merchant VNPay Sandbox nếu sử dụng thanh toán VNPay.

## Cài đặt

```bash
npm install
```

Tạo file `.env` từ `.env.example`:

```bash
copy .env.example .env
```

Trên macOS/Linux:

```bash
cp .env.example .env
```

Sau đó điền các giá trị cấu hình cần thiết.

## Chạy ứng dụng

```bash
# Development
npm run start:dev

# Chạy bình thường
npm run start

# Build production
npm run build

# Chạy bản đã build
npm run start:prod
```

API sử dụng global prefix `/api`. Khi chạy local, server mặc định có thể truy cập tại:

```text
http://localhost:3000/api
```

## Xác thực và phân quyền

Các endpoint được bảo vệ mặc định bằng JWT, ngoại trừ những route có decorator `@Public()` như đăng ký, đăng nhập và refresh token.

Gửi access token bằng header:

```http
Authorization: Bearer <access_token>
```

Refresh token được lưu trong cookie HttpOnly có tên `refresh_token`. Client cần bật gửi credentials khi gọi `login`, `refresh` và `logout`.

Các thao tác tạo, sửa, xóa dữ liệu catalog yêu cầu role `ADMIN`, bao gồm:

- Product
- Brand
- Category
- Coupon
- Product variant
- Quản lý user và thay đổi role

User thường chỉ được cập nhật thông tin của chính mình.

## API chính

Tất cả URL bên dưới đều có tiền tố `/api`.

### Auth

| Method | Endpoint                | Mô tả                                  |
| ------ | ----------------------- | -------------------------------------- |
| `POST` | `/auth/register`        | Đăng ký tài khoản                      |
| `POST` | `/auth/login`           | Đăng nhập và nhận access token         |
| `POST` | `/auth/refresh`         | Cấp access token mới từ refresh cookie |
| `POST` | `/auth/logout`          | Revoke refresh token hiện tại          |
| `POST` | `/auth/check-code`      | Kích hoạt tài khoản                    |
| `POST` | `/auth/retry-active`    | Gửi lại mã kích hoạt                   |
| `POST` | `/auth/retry-password`  | Gửi lại mã khôi phục mật khẩu          |
| `POST` | `/auth/change-password` | Đổi mật khẩu                           |

### Catalog

| Resource            | User operations   | Admin operations               |
| ------------------- | ----------------- | ------------------------------ |
| `/product`          | `GET`, `GET /:id` | `POST`, `PATCH`, `DELETE /:id` |
| `/brand`            | `GET`, `GET /:id` | `POST`, `PATCH`, `DELETE /:id` |
| `/category`         | `GET`, `GET /:id` | `POST`, `PATCH`, `DELETE /:id` |
| `/coupon`           | `GET`, `GET /:id` | `POST`, `PATCH`, `DELETE /:id` |
| `/product-variants` | `GET`, `GET /:id` | `POST`, `PATCH`, `DELETE /:id` |

Các endpoint danh sách hỗ trợ query phân trang như `current` và `pageSize`.

### User, address, cart và wishlist

| Method   | Endpoint                        | Mô tả                               |
| -------- | ------------------------------- | ----------------------------------- |
| `GET`    | `/users/me`                     | Lấy thông tin user hiện tại         |
| `PATCH`  | `/users`                        | Cập nhật thông tin cá nhân          |
| `GET`    | `/addresses`                    | Lấy địa chỉ của user                |
| `POST`   | `/addresses`                    | Tạo địa chỉ                         |
| `PATCH`  | `/addresses`                    | Cập nhật địa chỉ                    |
| `PATCH`  | `/addresses/:id/default`        | Đặt địa chỉ mặc định                |
| `DELETE` | `/addresses/:id`                | Xóa địa chỉ                         |
| `GET`    | `/cart`                         | Lấy giỏ hàng                        |
| `POST`   | `/cart/items`                   | Thêm sản phẩm vào giỏ               |
| `PATCH`  | `/cart/items`                   | Cập nhật số lượng                   |
| `DELETE` | `/cart/items/:productId`        | Xóa item, có thể truyền `variantId` |
| `DELETE` | `/cart`                         | Xóa toàn bộ giỏ hàng                |
| `GET`    | `/wishlist`                     | Lấy danh sách yêu thích             |
| `POST`   | `/wishlist/products`            | Thêm sản phẩm yêu thích             |
| `PATCH`  | `/wishlist`                     | Thay toàn bộ danh sách yêu thích    |
| `DELETE` | `/wishlist/products/:productId` | Xóa sản phẩm yêu thích              |
| `DELETE` | `/wishlist`                     | Xóa toàn bộ danh sách yêu thích     |

### Orders và payments

| Method  | Endpoint                   | Mô tả                          |
| ------- | -------------------------- | ------------------------------ |
| `POST`  | `/orders`                  | Tạo đơn hàng                   |
| `GET`   | `/orders`                  | Lấy đơn hàng của user          |
| `GET`   | `/orders/code/:orderCode`  | Tìm đơn theo mã đơn            |
| `GET`   | `/orders/:id`              | Xem chi tiết đơn               |
| `PATCH` | `/orders`                  | Cập nhật trạng thái theo quyền |
| `PATCH` | `/orders/cancel/:id`       | Hủy đơn                        |
| `POST`  | `/payments`                | Tạo payment                    |
| `GET`   | `/payments/order/:orderId` | Lấy payment theo đơn           |
| `POST`  | `/payments/:id/retry`      | Thử thanh toán lại             |
| `GET`   | `/payments/vnpay/ipn`      | VNPay IPN callback             |
| `GET`   | `/payments/vnpay/return`   | VNPay return callback          |

### Refund

| Method  | Endpoint       | Mô tả                          |
| ------- | -------------- | ------------------------------ |
| `POST`  | `/refunds`     | User tạo yêu cầu hoàn hàng     |
| `GET`   | `/refunds/:id` | User xem yêu cầu của mình      |
| `PATCH` | `/refunds/:id` | Admin chuyển trạng thái refund |

Trạng thái refund:

```text
REQUESTED -> APPROVED -> RECEIVED -> REFUNDED
REQUESTED -> REJECTED
```

## VNPay Sandbox

Payment VNPay trả về `paymentInfo.checkoutUrl`. Client chuyển người dùng tới URL này để thanh toán.

Để nhận IPN, cấu hình URL công khai của backend tại:

```text
GET /api/payments/vnpay/ipn
```

URL return cho người dùng là:

```text
GET /api/payments/vnpay/return
```

Trong môi trường local, IPN cần một tunnel hoặc backend public để VNPay có thể gọi tới. Không dùng thông tin merchant production trong môi trường phát triển.

## Test và kiểm tra chất lượng

```bash
# Unit test
npm test

# Test ở chế độ watch
npm run test:watch

# Coverage
npm run test:cov

# E2E test
npm run test:e2e

# Build TypeScript
npm run build

# Lint
npm run lint
```
