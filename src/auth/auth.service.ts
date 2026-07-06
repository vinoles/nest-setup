import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import ms, { type StringValue } from 'ms';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { RefreshSessionService } from './refresh-session.service';
import { TokenBlocklistService } from './token-blocklist.service';

const REFRESH_TOKEN_TTL_DEFAULT = '7d';
const INACTIVE_USER_MESSAGE = 'User account is inactive';

type AccessTokenIssueResult = {
  access_token: string;
  accessTokenJti: string;
  accessTokenExp: number;
};

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private refreshSessionService: RefreshSessionService,
    private configService: ConfigService,
    private tokenBlocklistService: TokenBlocklistService,
  ) {}

  async signIn(
    email: string,
    pass: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    let user;

    try {
      user = await this.usersService.findOneUserByEmail(email);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException('Invalid credentials');
      }

      throw error;
    }

    const passwordValid: boolean = await this.isPasswordValid(pass, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.assertUserIsActive(user.isActive);

    const { access_token, accessTokenJti, accessTokenExp } =
      await this.issueAccessToken(user.id, user.email, user.role);

    // Refresh token expires in 7 days by default (configurable via REFRESH_TOKEN_TTL)
    const refreshExpiresAt = this.getRefreshExpiresAt();
    const { token: refresh_token } = await this.refreshSessionService.createSession(
      user.id,
      refreshExpiresAt,
      accessTokenJti,
      accessTokenExp,
    );

    return { access_token, refresh_token };
  }

  async refresh(
    refresh_token: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const { userId } = await this.refreshSessionService.validateToken(refresh_token);

    const user = await this.usersService.findOneUserById(userId);
    this.assertUserIsActive(user.isActive);

    const { access_token, accessTokenJti, accessTokenExp } =
      await this.issueAccessToken(user.id, user.email, user.role);

    const refreshExpiresAt = this.getRefreshExpiresAt();
    const { token: newRefreshToken } =
      await this.refreshSessionService.rotateToken(
        refresh_token,
        refreshExpiresAt,
        accessTokenJti,
        accessTokenExp,
      );

    return { access_token, refresh_token: newRefreshToken };
  }

  async logout(refresh_token: string): Promise<void> {
    const { accessTokenJti, accessTokenExp } =
      await this.refreshSessionService.revokeSession(refresh_token);
    await this.tokenBlocklistService.add(accessTokenJti, accessTokenExp);
  }

  private async isPasswordValid(password: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
  }

  private getRefreshExpiresAt(): Date {
    const ttl = this.configService.get<string>(
      'REFRESH_TOKEN_TTL',
      REFRESH_TOKEN_TTL_DEFAULT,
    );
    return new Date(Date.now() + ms(ttl as StringValue));
  }

  private assertUserIsActive(isActive: boolean): void {
    if (!isActive) {
      throw new ForbiddenException(INACTIVE_USER_MESSAGE);
    }
  }

  private async issueAccessToken(
    userId: number,
    email: string,
    role: Role,
  ): Promise<AccessTokenIssueResult> {
    const accessTokenJti = randomUUID();
    const access_token = await this.jwtService.signAsync({
      sub: userId,
      email,
      role,
      jti: accessTokenJti,
    });

    const decoded = this.jwtService.decode(access_token) as
      | { exp?: unknown; jti?: unknown }
      | null;

    if (!decoded || typeof decoded !== 'object' || typeof decoded.exp !== 'number') {
      throw new Error('Unable to decode issued access token');
    }

    const { exp } = decoded as { exp: number };

    return {
      access_token,
      accessTokenJti: accessTokenJti,
      accessTokenExp: exp,
    };
  }
}
