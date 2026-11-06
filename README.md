# E-commerce Backend

Backend API cho hệ thống thương mại điện tử, được xây dựng bằng NestJS, TypeScript và MongoDB.

## Tính năng

- Đăng ký, đăng nhập bằng email/mật khẩu và xác thực JWT.
- Refresh token lưu trong HttpOnly cookie, có rotation và revoke khi logout.
- Phân quyền `USER` và `ADMIN`.
- Quản lý người dùng, danh mục, sản phẩm và biến thể sản phẩm.
- Địa chỉ giao hàng, giỏ hàng và danh sách yêu thích.
- Tạo đơn hàng, áp dụng coupon và theo dõi trạng thái đơn hàng.
- Thanh toán COD và tích hợp VNPay Sandbox.
- Tạo và xử lý yêu cầu hoàn hàng, hoàn tiền VNPay qua merchant API.
- Thông báo realtime qua WebSocket (Socket.IO) khi trạng thái đơn hàng hoặc thanh toán thay đổi.
- Thống kê cho trang quản trị.
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
    ├── carts/
    ├── categories/
    ├── coupons/
    ├── dashboard/
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

Sau đó điền các giá trị cấu hình cần thiết. Lưu ý:

- `CORS_ORIGINS`: danh sách origin của frontend, cách nhau bởi dấu phẩy. Mặc định là `http://localhost:3000`, môi trường production phải đặt đúng domain.
- `VNPAY_API_URL`: URL merchant API dùng để hoàn tiền. Mặc định trỏ tới sandbox, production phải đổi sang URL thật.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: tài khoản Cloudinary dùng lưu ảnh. Thiếu các biến này thì server vẫn chạy nhưng không tải ảnh lên được.

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
http://localhost:<PORT>/api
```

## Xác thực và phân quyền

Các endpoint được bảo vệ mặc định bằng JWT, ngoại trừ những route có decorator `@Public()` như đăng ký, đăng nhập và refresh token.

Gửi access token bằng header:

```http
Authorization: Bearer <access_token>
```

Refresh token được lưu trong cookie HttpOnly có tên `refresh_token`. Client cần bật gửi credentials khi gọi `login`, `refresh` và `logout`. Đổi mật khẩu sẽ thu hồi toàn bộ refresh token của tài khoản.

Đăng nhập trả `401` khi sai thông tin và `400` khi tài khoản chưa kích hoạt.

Các thao tác tạo, sửa, xóa dữ liệu catalog yêu cầu role `ADMIN`, bao gồm:

- Product
- Category
- Coupon
- Product variant
- Banner trang chủ
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
| `/category`         | `GET`, `GET /:id` | `POST`, `PATCH`, `DELETE /:id` |
| `/coupon`           | `GET`, `GET /:id` | `POST`, `PATCH`, `DELETE /:id` |
| `/product-variants` | `GET`, `GET /:id` | `POST`, `PATCH`, `DELETE /:id` |

Các endpoint danh sách hỗ trợ query phân trang như `current` và `pageSize` (tối đa 100).

`GET` của product, category và product-variants là public để khách chưa đăng nhập xem được cửa hàng. `GET` của coupon vẫn yêu cầu đăng nhập.

Giá của product và variant:

| Trường | Ý nghĩa |
| ------ | ------- |
| `basePrice` (product), `price` (variant) | **Giá bán**: giá khách trả, giỏ hàng và đơn hàng luôn tính theo giá này |
| `originalPrice` | **Giá trước giảm** (không bắt buộc), phải ≥ giá bán. Lớn hơn giá bán thì cửa hàng hiện gạch ngang kèm % giảm |
| `costPrice` | **Giá nhập** (giá vốn, không bắt buộc), để admin tính lãi. Không bao giờ trả ra API public |

Khi `PATCH` chỉ gửi một trong hai giá bán / trước giảm, backend so với giá còn lại đang lưu. Gửi `null` cho `originalPrice` hoặc `costPrice` để xoá.

`costPrice` khai báo `select: false` nên mặc định không có trong mọi truy vấn (kể cả populate). Chỉ `GET /product/admin/all` và `GET /product-variants/admin/all` (role `ADMIN`) trả kèm giá nhập. API public cũng bỏ qua mọi điều kiện lọc hoặc sắp xếp theo `costPrice` để không dò ra được giá nhập.

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
| `GET`   | `/orders/admin/all`        | Toàn bộ đơn hàng (admin)       |
| `GET`   | `/orders/code/:orderCode`  | Tìm đơn theo mã đơn            |
| `GET`   | `/orders/:id`              | Xem chi tiết đơn               |
| `PATCH` | `/orders`                  | Cập nhật trạng thái theo quyền |
| `PATCH` | `/orders/cancel/:id`       | Hủy đơn                        |
| `POST`  | `/payments`                | Tạo payment                    |
| `GET`   | `/payments/order/:orderId` | Lấy payment theo đơn           |
| `POST`  | `/payments/:id/retry`      | Thử thanh toán lại             |
| `GET`   | `/payments/vnpay/ipn`      | VNPay IPN callback             |
| `GET`   | `/payments/vnpay/return`   | VNPay return callback          |

### Cloudinary

| Method   | Endpoint             | Mô tả                                                                                   |
| -------- | -------------------- | --------------------------------------------------------------------------------------- |
| `POST`   | `/cloudinary/images` | Admin tải một ảnh lên (multipart, field `file`, tối đa 5MB, JPG/PNG/WEBP/AVIF)          |
| `POST`   | `/cloudinary/videos/signature` | Admin lấy chữ ký để trình duyệt tải video thẳng lên Cloudinary (MP4/WEBM/MOV, chữ ký chỉ cho thư mục `e-commerce`) |
| `DELETE` | `/cloudinary/images` | Admin xóa ảnh hoặc video theo `urls`; file còn được dùng ở sản phẩm, biến thể, đơn hàng, danh mục, banner hoặc người dùng sẽ giữ lại |

### Banner trang chủ

| Method   | Endpoint         | Quyền  | Mô tả |
| -------- | ---------------- | ------ | ----- |
| `GET`    | `/banner/active` | Public | Banner đang bật, theo `sortOrder` tăng dần, tối đa 10, chỉ gồm `title`, `mediaType`, `mediaUrl`, `link` |
| `GET`    | `/banner`        | Admin  | Danh sách có phân trang, gồm cả banner đang ẩn |
| `GET`    | `/banner/:id`    | Admin  | Chi tiết banner |
| `POST`   | `/banner`        | Admin  | Tạo banner: `title`, `mediaType` (`image` hoặc `video`), `mediaUrl` (https), `link` (`/...` hoặc http(s)), `sortOrder`, `isActive` |
| `PATCH`  | `/banner`        | Admin  | Cập nhật theo `_id`; gửi `link: null` để xóa đường dẫn. Đổi file thì file cũ trên Cloudinary được dọn |
| `DELETE` | `/banner/:id`    | Admin  | Xóa banner và file trên Cloudinary |

File Cloudinary của banner phải đúng loại với `mediaType`, nếu không API trả `400`.

### Refund

| Method  | Endpoint            | Mô tả                                  |
| ------- | ------------------- | -------------------------------------- |
| `POST`  | `/refunds`          | User tạo yêu cầu với đơn đã giao và đã thanh toán |
| `GET`   | `/refunds`          | User xem danh sách yêu cầu của mình    |
| `GET`   | `/refunds/admin/all` | Admin xem toàn bộ yêu cầu             |
| `GET`   | `/refunds/:id`      | Xem chi tiết yêu cầu                   |
| `PATCH` | `/refunds/:id`      | Admin chuyển trạng thái refund         |

Kho được cộng lại khi refund sang `RECEIVED`. Khi sang `REFUNDED`, đơn VNPay được hoàn tiền qua merchant API; nếu VNPay từ chối, trạng thái giữ nguyên để admin thử lại.

### Dashboard

| Method | Endpoint           | Mô tả                  |
| ------ | ------------------ | ---------------------- |
| `GET`  | `/dashboard/stats` | Số liệu thống kê (admin) |

Trạng thái refund:

```text
REQUESTED -> APPROVED -> RECEIVED -> REFUNDED
REQUESTED -> REJECTED
```

### Notifications

| Method   | Endpoint                       | Mô tả                                   |
| -------- | ------------------------------ | --------------------------------------- |
| `GET`    | `/notifications`               | Thông báo của user, kèm `unreadCount`   |
| `GET`    | `/notifications/unread-count`  | Số thông báo chưa đọc                   |
| `PATCH`  | `/notifications/read-all`      | Đánh dấu tất cả là đã đọc               |
| `PATCH`  | `/notifications/:id/read`      | Đánh dấu một thông báo là đã đọc        |
| `DELETE` | `/notifications/:id`           | Xoá thông báo                           |
| `POST`   | `/notifications/socket-ticket` | Vé mở WebSocket (sống 60 giây)          |
| `GET`    | `/notifications/push/public-key` | Khoá VAPID công khai (public)         |
| `POST`   | `/notifications/push/subscriptions` | Lưu đăng ký Web Push của trình duyệt |
| `DELETE` | `/notifications/push/subscriptions` | Xoá đăng ký Web Push (body `endpoint`) |

Khi nào có thông báo:

| Người nhận | Loại | Khi nào |
| ---------- | ---- | ------- |
| Khách | `ORDER_STATUS` | Đặt hàng, admin đổi trạng thái, huỷ đơn, các bước hoàn hàng |
| Khách | `PAYMENT_STATUS` | Đơn được thanh toán (VNPay IPN hoặc admin đánh dấu COD) |
| Mọi khách | `PROMOTION` | Admin tạo coupon đang hiệu lực |
| Khách có sản phẩm trong wishlist | `WISHLIST_RESTOCK`, `WISHLIST_PRICE_DROP` | Sản phẩm hoặc biến thể từ hết hàng sang có hàng, hoặc giảm giá |
| Mọi admin | `NEW_ORDER` | Có đơn mới |
| Mọi admin | `REFUND_REQUESTED` | Khách gửi yêu cầu hoàn hàng |
| Mọi admin | `LOW_STOCK` | Đơn hàng làm tồn kho rơi xuống còn 5 trở xuống (chỉ báo lần vượt ngưỡng) |
| Mọi admin | `MANUAL_REFUND_REQUIRED` | Tiền VNPay về sau khi đơn đã đóng |

Mỗi thông báo được lưu vào MongoDB, có `link` là đường dẫn trên frontend để mở khi bấm, và tự xoá sau 90 ngày (TTL index trên `createdAt`). Thông báo được đẩy realtime qua WebSocket; user không mở trang nào thì nhận Web Push nếu đã bật. Lỗi khi gửi thông báo chỉ được ghi log, không làm hỏng nghiệp vụ.

Kết nối WebSocket tới namespace `/notifications` (không có prefix `/api`), origin lấy từ `CORS_ORIGINS`. Nên dùng vé từ `POST /notifications/socket-ticket` để trình duyệt không phải giữ access token; vé ký bằng secret riêng nên không gọi được REST API. Access token cũng được chấp nhận:

```ts
import { io } from 'socket.io-client';

const socket = io(`${BACKEND_URL}/notifications`, {
  auth: { token: ticketOrAccessToken },
});
socket.on('notification', (notification) => {
  // { _id, type, title, message, link, data, isRead, createdAt }
});
socket.on('unauthorized', ({ message }) => {
  // Token thiếu, sai hoặc hết hạn: lấy vé mới rồi kết nối lại
});
```

Server ngắt socket khi access token của phiên hết hạn, client cần lấy vé mới rồi kết nối lại.

Web Push cần `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` và `VAPID_SUBJECT` (tạo khoá bằng `npx web-push generate-vapid-keys`). Bỏ trống thì Web Push tắt, thông báo trong trang vẫn hoạt động. Đăng ký mà trình duyệt đã huỷ (404/410) được tự xoá.

## VNPay Sandbox

Payment VNPay trả về `paymentInfo.checkoutUrl`. Client chuyển người dùng tới URL này để thanh toán.

Nếu tiền về sau khi đơn đã đóng, đơn giữ nguyên trạng thái và payment được gắn `requiresManualRefund: true` để xử lý thủ công.

Để nhận IPN, cấu hình URL công khai của backend tại:

```text
GET /api/payments/vnpay/ipn
```

Đặt `VNPAY_RETURN_URL` trỏ tới trang kết quả của frontend, ví dụ `http://localhost:3000/checkout/result`. Trang này gọi endpoint sau của backend để xác thực chữ ký và hiển thị kết quả cho khách:

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
