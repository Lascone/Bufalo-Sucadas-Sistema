import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service.js';
import { DevicesController } from './devices.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
