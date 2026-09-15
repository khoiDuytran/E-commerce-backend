import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
} from '@nestjs/common';
import { AddressesService } from './addresses.service.js';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';

@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(req.user._id, dto);
  }

  @Get()
  findAll(@Req() req) {
    return this.addressesService.findAllByUser(req.user._id);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.addressesService.findOne(id, req.user._id);
  }

  @Patch()
  update(@Req() req, @Body() updateAddressDto: UpdateAddressDto) {
    return this.addressesService.update(req.user._id, updateAddressDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.addressesService.remove(id, req.user._id);
  }

  @Patch(':id/default')
  setDefault(@Param('id') id: string, @Req() req) {
    return this.addressesService.setDefault(id, req.user._id);
  }
}
