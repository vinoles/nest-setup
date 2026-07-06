import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from '../auth/roles.guard';
import { SelfOrAdminGuard } from '../auth/self-or-admin.guard';
import { UsersLookupModule } from './users-lookup.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule, UsersLookupModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, RolesGuard, SelfOrAdminGuard],
  exports: [UsersService],
})
export class UsersModule {}
