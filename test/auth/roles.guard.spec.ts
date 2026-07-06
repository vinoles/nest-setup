import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../../src/auth/roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  const makeContext = (role?: Role) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role } }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<
      Pick<Reflector, 'getAllAndOverride'>
    >;
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows access when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('allows access when the required roles list is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('allows access when the user has a required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(makeContext(Role.ADMIN))).toBe(true);
  });

  it('throws ForbiddenException when the user does not have the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(makeContext(Role.USER))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when the user has no role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
