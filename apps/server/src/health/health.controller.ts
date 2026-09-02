import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.module.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let postgres = 'up';
    let detail: string | undefined;
    try {
      await this.prisma.db.$queryRawUnsafe('SELECT 1 AS ok');
    } catch (err) {
      postgres = 'down';
      detail = err instanceof Error ? err.message : String(err);
    }

    return {
      status: postgres === 'up' ? 'ok' : 'degraded',
      service: 'ferrogestor-api',
      postgres,
      database: postgres,
      detail,
      timestamp: new Date().toISOString(),
    };
  }
}
