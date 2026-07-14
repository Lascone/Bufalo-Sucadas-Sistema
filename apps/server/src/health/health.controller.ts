import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.module.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let database = 'up';
    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'ferrogestor-api',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
