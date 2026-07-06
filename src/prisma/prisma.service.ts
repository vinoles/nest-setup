import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  throw new Error('DATABASE_URL is required to initialize PrismaService');
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly canConnect = Boolean(process.env.DATABASE_URL);

  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: resolveDatabaseUrl(),
      }),
    });
  }

  async onModuleInit() {
    if (!this.canConnect) {
      return;
    }

    try {
      await this.$connect();
    } catch (error: unknown) {
      this.logger.error(
        'Failed to connect to the database',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    app.enableShutdownHooks();
  }
}
