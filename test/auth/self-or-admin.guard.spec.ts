import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SelfOrAdminGuard } from '../../src/auth/self-or-admin.guard';

describe('SelfOrAdminGuard', () => {
  let guard: SelfOrAdminGuard;

  const makeContext = (
    user: { sub?: number; role?: Role },
    params: { id?: string } = {},
  ) =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user, params }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new SelfOrAdminGuard();
  });

  it('allows access for admins regardless of the target id', () => {
    expect(
      guard.canActivate(makeContext({ role: Role.ADMIN, sub: 1 }, { id: '99' })),
    ).toBe(true);
  });

  it('allows access when the user is accessing their own resource', () => {
    expect(
      guard.canActivate(makeContext({ role: Role.USER, sub: 5 }, { id: '5' })),
    ).toBe(true);
  });

  it('throws ForbiddenException when a non-admin accesses another user resource', () => {
    expect(() =>
      guard.canActivate(makeContext({ role: Role.USER, sub: 1 }, { id: '2' })),
    ).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the param id is not a valid integer', () => {
    expect(() =>
      guard.canActivate(makeContext({ role: Role.USER, sub: 1 }, { id: 'abc' })),
    ).toThrow(ForbiddenException);
  });
});
