import {
  Global,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import mongoose from 'mongoose';

@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  connected = false;

  async onModuleInit() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      this.logger.warn('MONGODB_URI não definido — sync remoto indisponível');
      return;
    }
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri);
    this.connected = true;
    this.logger.log('MongoDB Atlas conectado');
  }

  async onModuleDestroy() {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      this.connected = false;
    }
  }

  isReady(): boolean {
    return this.connected && mongoose.connection.readyState === 1;
  }
}

@Global()
@Module({
  providers: [MongoService],
  exports: [MongoService],
})
export class MongoModule {}
