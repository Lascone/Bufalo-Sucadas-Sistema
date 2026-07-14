import { Global, Module, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createCentralPrisma, type CentralPrismaClient } from '@ferrogestor/database';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: CentralPrismaClient = createCentralPrisma(process.env.DATABASE_URL);

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
