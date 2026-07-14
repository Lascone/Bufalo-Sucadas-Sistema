import {
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.module.js';
import type { JwtPayload } from './jwt-auth.guard.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async login(input: {
    username: string;
    password: string;
    deviceId?: string;
  }) {
    const user = await this.prisma.db.user.findFirst({
      where: {
        username: input.username,
        deletedAt: null,
        active: true,
      },
      include: { role: true, company: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Usuário temporariamente bloqueado');
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const max = Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5);
      const lockMinutes = Number(process.env.LOCKOUT_MINUTES ?? 15);
      await this.prisma.db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil:
            attempts >= max
              ? new Date(Date.now() + lockMinutes * 60_000)
              : null,
        },
      });
      await this.prisma.db.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          deviceId: input.deviceId,
          action: 'LOGIN_FAILED',
          entityType: 'User',
          entityId: user.id,
        },
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (input.deviceId) {
      const device = await this.prisma.db.device.findUnique({
        where: { id: input.deviceId },
      });
      if (!device || device.blocked || device.deletedAt) {
        throw new ForbiddenException('Dispositivo não autorizado');
      }
      await this.prisma.db.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });
    }

    await this.prisma.db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        deviceId: input.deviceId,
        action: 'LOGIN',
        entityType: 'User',
        entityId: user.id,
      },
    });

    return this.issueTokens({
      sub: user.id,
      companyId: user.companyId,
      branchId: user.branchId,
      deviceId: input.deviceId ?? null,
      username: user.username,
      roleCode: user.role.code,
    });
  }

  async issueTokens(payload: JwtPayload) {
    const accessToken = await this.jwt.signAsync(
      { ...payload },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me-32c',
        expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as `${number}m`,
      },
    );
    const refreshRaw = randomBytes(48).toString('hex');
    const refreshHash = this.hashToken(refreshRaw);
    const days = 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.db.refreshToken.create({
      data: {
        userId: payload.sub,
        deviceId: payload.deviceId ?? undefined,
        tokenHash: refreshHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshRaw,
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      user: {
        id: payload.sub,
        username: payload.username,
        companyId: payload.companyId,
        branchId: payload.branchId,
        roleCode: payload.roleCode,
      },
    };
  }

  async refresh(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    const stored = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: { include: { role: true } } },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    await this.prisma.db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens({
      sub: stored.user.id,
      companyId: stored.user.companyId,
      branchId: stored.user.branchId,
      deviceId: stored.deviceId,
      username: stored.user.username,
      roleCode: stored.user.role.code,
    });
  }
}
