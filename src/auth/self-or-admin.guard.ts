import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';

@Injectable()
export class SelfOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { sub?: number; role?: Role };
      params?: { id?: string };
    }>();

    if (request.user?.role === Role.ADMIN) {
      return true;
    }

    const targetId = Number(request.params?.id);
    const isSelf = Number.isInteger(targetId) && request.user?.sub === targetId;

    if (!isSelf) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
