import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersLookupService } from './users-lookup.service';

@Module({
  imports: [PrismaModule],
  providers: [UsersLookupService],
  exports: [UsersLookupService],
})
export class UsersLookupModule {}
