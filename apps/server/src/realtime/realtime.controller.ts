import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { syncPullQuerySchema, syncPushRequestSchema } from '@ferrogestor/shared';
import { RealtimeService } from './realtime.service.js';
import { CurrentUser, JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard.js';

@ApiTags('realtime')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('realtime')
export class RealtimeController {
  constructor(@Inject(RealtimeService) private readonly realtime: RealtimeService) {}

  @Post('push')
  async push(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = syncPushRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const deviceId = user.deviceId ?? parsed.data.deviceId;
    return this.realtime.push(user.companyId, deviceId, user.sub, parsed.data.operations);
  }

  @Get('changes')
  async changes(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    const parsed = syncPullQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.realtime.pull(
      user.companyId,
      parsed.data.deviceId,
      new Date(parsed.data.since),
      parsed.data.limit,
    );
  }

  @Get('status')
  async status(@CurrentUser() user: JwtPayload) {
    return this.realtime.status(user.companyId);
  }
}
