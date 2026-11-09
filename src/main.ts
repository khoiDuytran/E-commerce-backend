import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, ObserveInstrument } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { SocketIoAdapter } from './core/socket-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get('PORT');

  // Số tầng reverse proxy (nginx, load balancer) đứng trước backend. Cần đặt khi deploy sau
  // proxy để req.ip là IP thật của khách (rate limit đếm theo IP). Để trống khi chạy trực tiếp,
  // nếu không client có thể tự gửi X-Forwarded-For giả để lách giới hạn
  const trustProxyHops = Number(configService.get('TRUST_PROXY'));
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }
  app.setGlobalPrefix('api', { exclude: [''] });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // WebSocket (thông báo realtime) dùng cùng danh sách origin với HTTP
  app.useWebSocketAdapter(new SocketIoAdapter(app, corsOrigins));

  //config cors
  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    credentials: true,
  });

  await app.listen(port);
}
await bootstrap();
