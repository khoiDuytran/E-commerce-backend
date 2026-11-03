import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Public } from '../../decorator/customize.js';
import {
  SubscribePushDto,
  UnsubscribePushDto,
} from './dto/subscribe-push.dto.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { NotificationsService } from './notifications.service.js';
import { WebPushService } from './web-push.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly gateway: NotificationsGateway,
    private readonly webPushService: WebPushService,
  ) {}

  @Get()
  findAll(
    @Req() req,
    @Query() query: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.notificationsService.findAll(
      req.user._id,
      query,
      +current,
      +pageSize,
    );
  }

  @Get('unread-count')
  countUnread(@Req() req) {
    return this.notificationsService.countUnread(req.user._id);
  }

  /** Vé ngắn hạn để mở WebSocket, giúp frontend không phải đưa access token xuống trình duyệt */
  @Post('socket-ticket')
  createSocketTicket(@Req() req) {
    const header: string | undefined = req.headers?.authorization;
    const accessToken = header?.startsWith('Bearer ')
      ? header.slice(7)
      : undefined;
    return this.gateway.createTicket(req.user._id, accessToken);
  }

  @Public()
  @Get('push/public-key')
  getPushPublicKey() {
    return this.webPushService.getPublicKey();
  }

  @Post('push/subscriptions')
  subscribePush(@Req() req, @Body() dto: SubscribePushDto) {
    return this.webPushService.subscribe(req.user._id, dto);
  }

  @Delete('push/subscriptions')
  unsubscribePush(@Req() req, @Body() dto: UnsubscribePushDto) {
    return this.webPushService.unsubscribe(req.user._id, dto.endpoint);
  }

  @Patch('read-all')
  markAllRead(@Req() req) {
    return this.notificationsService.markAllRead(req.user._id);
  }

  @Patch(':id/read')
  markRead(@Req() req, @Param('id') id: string) {
    return this.notificationsService.markRead(req.user._id, id);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.notificationsService.remove(req.user._id, id);
  }
}
