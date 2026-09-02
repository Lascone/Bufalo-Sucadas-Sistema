import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.module.js';
import { MongoService } from '../mongo/mongo.module.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MongoService) private readonly mongo: MongoService,
  ) {}

  @Get()
  async check() {
    let postgres = 'up';
    let postgresDetail: string | undefined;
    try {
      await this.prisma.db.$queryRawUnsafe('SELECT 1 AS ok');
    } catch (err) {
      postgres = 'down';
      postgresDetail = err instanceof Error ? err.message : String(err);
    }

    const mongodb = this.mongo.isReady() ? 'up' : 'optional';

    return {
      status: postgres === 'up' ? 'ok' : 'degraded',
      service: 'ferrogestor-api',
      postgres,
      mongodb,
      database: 'postgresql',
      detail: postgresDetail,
      timestamp: new Date().toISOString(),
    };
  }
}
