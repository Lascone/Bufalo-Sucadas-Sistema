import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.module.js';
import { AuthService } from '../auth/auth.service.js';

@Injectable()
export class DevicesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async register(input: {
    companyId: string;
    branchId?: string;
    friendlyName: string;
    createdByUserId: string;
  }) {
    const secret = randomBytes(32).toString('hex');
    const deviceSecretHash = await argon2.hash(secret);
    const device = await this.prisma.db.device.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId,
        friendlyName: input.friendlyName,
        deviceSecretHash,
        createdByUserId: input.createdByUserId,
        syncStatus: 'SYNCED',
      },
    });
    return {
      device: {
        id: device.id,
        friendlyName: device.friendlyName,
        companyId: device.companyId,
        branchId: device.branchId,
      },
      deviceSecret: secret,
    };
  }

  async authenticate(input: {
    deviceId: string;
    deviceSecret: string;
    username: string;
    password: string;
  }) {
    const device = await this.prisma.db.device.findUnique({
      where: { id: input.deviceId },
    });
    if (!device || device.deletedAt) {
      throw new NotFoundException('Dispositivo não encontrado');
    }
    if (device.blocked) {
      throw new ForbiddenException(
        device.blockedReason ?? 'Dispositivo bloqueado',
      );
    }
    const ok = await argon2.verify(device.deviceSecretHash, input.deviceSecret);
    if (!ok) {
      throw new ForbiddenException('Segredo do dispositivo inválido');
    }
    return this.auth.login({
      username: input.username,
      password: input.password,
      deviceId: device.id,
    });
  }

  async list(companyId: string) {
    return this.prisma.db.device.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true,
        friendlyName: true,
        branchId: true,
        lastSeenAt: true,
        blocked: true,
        blockedReason: true,
        appVersion: true,
        createdAt: true,
      },
      orderBy: { friendlyName: 'asc' },
    });
  }

  async block(deviceId: string, companyId: string, reason: string) {
    const device = await this.prisma.db.device.findFirst({
      where: { id: deviceId, companyId },
    });
    if (!device) throw new NotFoundException('Dispositivo não encontrado');
    if (!reason.trim()) throw new BadRequestException('Informe o motivo');
    return this.prisma.db.device.update({
      where: { id: deviceId },
      data: { blocked: true, blockedReason: reason },
    });
  }
}
