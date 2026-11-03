# Backend

Thêm module mới: dùng skill `add-backend-module`. Sửa order, payment, refund hoặc VNPay: dùng skill `payment-flow-check`.

## Quy ước

- Dự án chạy ESM: import nội bộ phải có đuôi `.js`.
- `JwtAuthGuard` bảo vệ mọi route theo mặc định. Route public phải có `@Public()`. Route admin phải có cả `@UseGuards(RolesGuard)` và `@Roles(UserRole.ADMIN)`.
- `TransformInterceptor` bọc mọi response thành `{ statusCode, message, data }`. Endpoint cần trả nguyên body, như callback của cổng thanh toán, dùng `@RawResponse()`.

## Bảo mật

- Field từ client đi vào query Mongo phải có `@IsString`, `@IsMongoId` hoặc tương đương. `@IsNotEmpty` một mình vẫn cho object như `{"$ne": null}` đi qua.
- Không dùng `@Body('field')` cho dữ liệu đi vào query, vì cách này bỏ qua DTO. Tạo DTO riêng.
- Không bật `sanitizeFilter` toàn cục: các service đang dùng toán tử như `$gte`, `$expr` trong filter.
- Route login chạy `LocalAuthGuard` trước `ValidationPipe`, nên DTO không bảo vệ được dữ liệu ở bước guard. Kiểm tra kiểu trong `LocalStrategy`.
- Đăng nhập trả `401` khi sai thông tin và `400` khi tài khoản chưa kích hoạt. Frontend dựa vào hai mã này.
- Với API list, gán filter bắt buộc (như `user`) sau khi parse `aqp` để client không ghi đè được.

## Bẫy đã gặp

- `@Prop({ type: Types.ObjectId })` bị `@nestjs/mongoose` hiểu là `Mixed`, nên Mongoose không ép kiểu: dữ liệu hiện có trộn cả chuỗi và ObjectId. Lọc theo field tham chiếu ở catalog dùng `matchIdInAnyForm`. Đừng đổi schema nếu chưa migrate dữ liệu, vì query sẽ không còn khớp các bản ghi lưu dạng chuỗi.
- `aqp` chuyển nguyên `$where`, `$expr` từ URL vào filter. Mọi API list nhận query từ client phải gọi `stripUnsafeOperators`. Hiện mới áp dụng cho product, brand, category và product-variants.
- `Order.paymentStatus` (`PaymentStatus`) và `Payment.status` (`PaymentTransactionStatus`) là hai enum khác nhau. `updateOne` không chạy validator nên giá trị sai vẫn được lưu.
- `expiresIn` dạng số của JWT tính bằng giây, còn `parseDurationToMs` trả về mili-giây.
- Tiền VND phải là số nguyên. Làm tròn trước khi lưu.
- Promise của `mailerService.sendMail` phải có `await` và xử lý lỗi. Unhandled rejection có thể làm sập process.
- Mongoose 9 không dùng option `new: true`. Dùng `returnDocument: 'after'`.
- `dist/` phải chạy được khi không có `src/`, nên asset đọc từ `import.meta.dirname` và khai báo trong `assets` của `nest-cli.json`.
- Package dùng lúc chạy phải nằm trong `dependencies`.

## Test

Dùng Vitest, đặt `*.spec.ts` cạnh file được test. Khởi tạo service trực tiếp với model mock bằng `vi.fn()`, xem [orders.service.spec.ts](src/modules/orders/orders.service.spec.ts).
