import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { MongoModule } from './mongo/mongo.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { SyncModule } from './sync/sync.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    MongoModule,
    HealthModule,
    AuthModule,
    DevicesModule,
    SyncModule,
    RealtimeModule,
  ],
})
export class AppModule {}
