import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { CartService } from './cart.service.js';
import { CartItemDto } from './dto/create-cart.dto.js';
import { UpdateCartDto } from './dto/update-cart.dto.js';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  findCart(@Req() req) {
    return this.cartService.findByUser(req.user._id);
  }

  @Post('items')
  addItem(@Req() req, @Body() dto: CartItemDto) {
    return this.cartService.addItem(req.user._id, dto);
  }

  @Patch('items')
  updateItem(@Req() req, @Body() updateCartDto: UpdateCartDto) {
    return this.cartService.updateItem(req.user._id, updateCartDto);
  }

  @Delete('items/:productId')
  removeItem(@Req() req, @Param('productId') productId: string) {
    return this.cartService.removeItem(req.user._id, productId);
  }

  @Delete()
  clear(@Req() req) {
    return this.cartService.clear(req.user._id);
  }
}
