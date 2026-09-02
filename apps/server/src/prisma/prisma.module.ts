import { Global, Module, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createCentralPrisma, type CentralPrismaClient } from '@ferrogestor/database';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';

function resolveDatabaseUrl(): string {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      loadEnv({ path: file, override: false });
    }
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL não definido. Configure PostgreSQL no arquivo .env na raiz do monorepo.',
    );
  }
  return url;
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly db: CentralPrismaClient = createCentralPrisma(resolveDatabaseUrl());

  async onModuleInit() {
    await this.db.$connect();
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
