import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  resolveConflictSchema,
  syncPullQuerySchema,
  syncPushRequestSchema,
} from '@ferrogestor/shared';
import { SyncService } from './sync.service.js';
import { CurrentUser, JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard.js';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  @Post('push')
  async push(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = syncPushRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const deviceId = user.deviceId ?? parsed.data.deviceId;
    return this.sync.push(
      user.companyId,
      deviceId,
      user.sub,
      parsed.data.operations,
    );
  }

  @Get('pull')
  async pull(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    const parsed = syncPullQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.sync.pull(
      user.companyId,
      parsed.data.deviceId,
      new Date(parsed.data.since),
      parsed.data.limit,
    );
  }

  @Get('status')
  async status(@CurrentUser() user: JwtPayload) {
    return this.sync.status(user.companyId);
  }

  @Post('conflicts/:id/resolve')
  async resolve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = resolveConflictSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.sync.resolveConflict(
      id,
      user.companyId,
      user.sub,
      parsed.data.resolution,
      parsed.data.justification,
      parsed.data.mergedPayload,
    );
  }
}
