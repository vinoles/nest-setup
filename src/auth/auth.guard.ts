import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { TokenBlocklistService } from './token-blocklist.service';

type JwtPayload = {
  sub: number;
  email: string;
  role: Role;
  jti: string;
  exp: number;
};

const INACTIVE_USER_MESSAGE = 'User account is inactive';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly tokenBlocklistService: TokenBlocklistService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    const payload = await this.verifyAccessToken(token);

    if (await this.tokenBlocklistService.isBlocked(payload.jti)) {
      throw new UnauthorizedException();
    }

    const user = await this.findActiveUser(payload.sub);

    if (!user.isActive) {
      throw new ForbiddenException(INACTIVE_USER_MESSAGE);
    }

    // 💡 We're assigning the payload to the request object here
    // so that we can access it in our route handlers
    request['user'] = payload;

    return true;
  }

  private async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      if (!this.isJwtPayload(payload)) {
        throw new UnauthorizedException();
      }

      return payload;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async findActiveUser(userId: number): Promise<{ isActive: boolean }> {
    try {
      return await this.usersService.findOneUserById(userId);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException();
      }

      throw error;
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private isJwtPayload(payload: unknown): payload is JwtPayload {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }

    const candidate = payload as Partial<JwtPayload>;

    return (
      typeof candidate.sub === 'number' &&
      typeof candidate.email === 'string' &&
      typeof candidate.role === 'string' &&
      typeof candidate.jti === 'string' &&
      typeof candidate.exp === 'number'
    );
  }
}
