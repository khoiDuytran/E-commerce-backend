import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';

export const NOTIFICATION_EVENT = 'notification';

// Vé chỉ dùng để mở kết nối nên sống ngắn
export const SOCKET_TICKET_TTL_SECONDS = 60;

// setTimeout không nhận quá ~24,8 ngày
const MAX_TIMEOUT_MS = 2_147_483_647;

export const userRoom = (userId: string) => `user:${userId}`;

interface SocketIdentity {
  userId: string;
  // Thời điểm (giây) phiên đăng nhập hết hạn: socket bị ngắt lúc đó
  sessionExp?: number;
}

/**
 * Client kết nối tới namespace /notifications bằng vé socket (POST /notifications/socket-ticket)
 * hoặc access token: io(`${BACKEND_URL}/notifications`, { auth: { token } }).
 * Mỗi socket vào room của user để nhận thông báo realtime.
 */
@WebSocketGateway({ namespace: '/notifications' })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);
  // Secret riêng để vé socket không dùng được như access token cho REST API
  private readonly ticketSecret: string;

  @WebSocketServer()
  server: Namespace;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.ticketSecret = `${configService.getOrThrow<string>('JWT_SECRET')}:socket-ticket`;
  }

  /** Vé ngắn hạn để client mở socket mà không cần giữ access token ở trình duyệt */
  createTicket(userId: string, accessToken?: string) {
    const decoded = accessToken
      ? (this.jwtService.decode(accessToken) as { exp?: number } | null)
      : null;
    const ticket = this.jwtService.sign(
      { sub: userId, sessionExp: decoded?.exp },
      { secret: this.ticketSecret, expiresIn: SOCKET_TICKET_TTL_SECONDS },
    );
    return { ticket, expiresIn: SOCKET_TICKET_TTL_SECONDS };
  }

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      return this.reject(client, 'Thiếu access token');
    }

    const identity = await this.verify(token);
    if (!identity) {
      return this.reject(client, 'Access token không hợp lệ hoặc đã hết hạn');
    }

    await client.join(userRoom(identity.userId));

    // Ngắt kết nối khi phiên hết hạn: client lấy vé mới rồi kết nối lại
    if (identity.sessionExp) {
      const msLeft = identity.sessionExp * 1000 - Date.now();
      const timer = setTimeout(
        () => this.reject(client, 'Access token đã hết hạn'),
        Math.min(Math.max(msLeft, 0), MAX_TIMEOUT_MS),
      );
      client.once('disconnect', () => clearTimeout(timer));
    }
  }

  sendToUser(userId: string, payload: unknown) {
    this.server?.to(userRoom(userId)).emit(NOTIFICATION_EVENT, payload);
  }

  /** User có đang mở trang (có socket kết nối) hay không */
  async isOnline(userId: string) {
    if (!this.server) return false;
    const sockets = await this.server.in(userRoom(userId)).fetchSockets();
    return sockets.length > 0;
  }

  private async verify(token: string): Promise<SocketIdentity | null> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub?: string;
        sessionExp?: number;
      }>(token, { secret: this.ticketSecret });
      if (payload.sub) {
        return { userId: String(payload.sub), sessionExp: payload.sessionExp };
      }
    } catch {
      // Không phải vé socket: thử như access token
    }
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub?: string;
        exp?: number;
      }>(token);
      if (payload.sub) {
        return { userId: String(payload.sub), sessionExp: payload.exp };
      }
    } catch {
      // Token sai hoặc hết hạn
    }
    return null;
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken) {
      return authToken.replace(/^Bearer\s+/i, '');
    }
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }

  private reject(client: Socket, message: string) {
    this.logger.debug(`Từ chối socket ${client.id}: ${message}`);
    client.emit('unauthorized', { message });
    client.disconnect(true);
  }
}
