import { Global, Module, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createCentralPrisma, type CentralPrismaClient } from '@ferrogestor/database';

function resolveDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly db: CentralPrismaClient = createCentralPrisma(resolveDatabaseUrl());

  async onModuleInit() {
    if (!resolveDatabaseUrl()) {
      this.logger.warn(
        'DATABASE_URL nÃ£o definido â€” configure o Postgres (env ou ConfiguraÃ§Ãµes â†’ Banco online no desktop).',
      );
      return;
    }
    try {
      await this.db.$connect();
      this.logger.log('PostgreSQL conectado');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`PostgreSQL indisponÃ­vel â€” ${msg}`);
    }
  }

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
