import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RefreshSessionService } from './refresh-session.service';
import { TokenBlocklistService } from './token-blocklist.service';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersLookupModule } from '../users/users-lookup.module';

@Module({
  imports: [
    UsersLookupModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'JWT_EXPIRES_IN',
          ) as NonNullable<JwtModuleOptions['signOptions']>['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthGuard,
    AuthService,
    RefreshSessionService,
    TokenBlocklistService,
  ],
  exports: [
    AuthGuard,
    AuthService,
    RefreshSessionService,
    TokenBlocklistService,
  ],
})
export class AuthModule {}
