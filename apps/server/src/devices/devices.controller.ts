import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { deviceAuthSchema } from '@ferrogestor/shared';
import { z } from 'zod';
import { DevicesService } from './devices.service.js';
import { CurrentUser, JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard.js';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(@Inject(DevicesService) private readonly devices: DevicesService) {}

  @Post('auth')
  async auth(@Body() body: unknown) {
    const parsed = deviceAuthSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.devices.authenticate(parsed.data);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.devices.list(user.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('register')
  async register(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const schema = z.object({
      friendlyName: z.string().min(2),
      branchId: z.string().uuid().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.devices.register({
      companyId: user.companyId,
      branchId: parsed.data.branchId ?? user.branchId ?? undefined,
      friendlyName: parsed.data.friendlyName,
      createdByUserId: user.sub,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/block')
  async block(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const schema = z.object({ reason: z.string().min(3) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.devices.block(id, user.companyId, parsed.data.reason);
  }
}
