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
import { WishlistService } from './wishlist.service.js';
import { CreateWishlistDto } from './dto/create-wishlist.dto.js';
import { UpdateWishlistDto } from './dto/update-wishlist.dto.js';

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  findWishlist(@Req() req) {
    return this.wishlistService.findByUser(req.user._id);
  }

  @Post('products')
  addProduct(@Req() req, @Body() createWishlistDto: CreateWishlistDto) {
    return this.wishlistService.addProduct(req.user._id, createWishlistDto);
  }

  @Patch()
  update(@Req() req, @Body() updateWishlistDto: UpdateWishlistDto) {
    return this.wishlistService.update(req.user._id, updateWishlistDto);
  }

  @Delete('products/:productId')
  removeProduct(@Req() req, @Param('productId') productId: string) {
    return this.wishlistService.removeProduct(req.user._id, productId);
  }

  @Delete()
  clear(@Req() req) {
    return this.wishlistService.clear(req.user._id);
  }
}
