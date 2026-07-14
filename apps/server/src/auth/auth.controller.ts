import { Body, Controller, Post, BadRequestException, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { loginSchema } from '@ferrogestor/shared';
import { AuthService } from './auth.service.js';
import { z } from 'zod';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() body: unknown) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.auth.login(parsed.data);
  }

  @Post('refresh')
  async refresh(@Body() body: unknown) {
    const schema = z.object({ refreshToken: z.string().min(20) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.auth.refresh(parsed.data.refreshToken);
  }
}
