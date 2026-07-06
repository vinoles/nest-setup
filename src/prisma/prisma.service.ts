import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { parseEnv } from '../config/env.schema';

function resolveDatabaseUrl() {
  const env = parseEnv(process.env);

  if (env.NODE_ENV === 'test' && env.TEST_DATABASE_URL) {
    return env.TEST_DATABASE_URL;
  }

  return env.DATABASE_URL;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly canConnect: boolean;

  constructor() {
    const databaseUrl = resolveDatabaseUrl();

    super({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
      }),
    });

    this.canConnect = Boolean(databaseUrl);
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
