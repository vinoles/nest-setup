import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { App } from 'supertest/types';

const TEST_JWT_SECRET = 'test-jwt-secret';
const TEST_JWT_EXPIRES_IN = '15m';

type JwtPayload = {
  sub: number;
  email: string;
  role: Role;
  jti?: string;
};

export function configureJwtTestEnv(): void {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_EXPIRES_IN = TEST_JWT_EXPIRES_IN;
}

export async function createTestAccessToken(
  app: INestApplication<App>,
  payload: JwtPayload = {
    sub: 1,
    email: 'admin@example.test',
    role: Role.ADMIN,
    jti: 'test-access-jti',
  },
): Promise<string> {
  const jwtService = app.get(JwtService);
  const tokenPayload: JwtPayload = {
    sub: 1,
    email: 'admin@example.test',
    role: Role.ADMIN,
    jti: 'test-access-jti',
    ...payload,
  };

  return await jwtService.signAsync(tokenPayload, {
    expiresIn: TEST_JWT_EXPIRES_IN,
  });
}

export function buildBearerToken(token: string): string {
  return `Bearer ${token}`;
}
