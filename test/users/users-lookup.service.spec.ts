import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersLookupService } from '../../src/users/users-lookup.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('UsersLookupService', () => {
  let service: UsersLookupService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersLookupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersLookupService>(UsersLookupService);
  });

  it('normalizes email before querying Prisma', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'admin@example.test',
    });

    await service.findOneUserByEmail('  ADMIN@EXAMPLE.TEST  ');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.test' },
    });
  });

  it('throws not found with the normalized email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findOneUserByEmail('  Missing@Example.Test  ')).rejects.toThrow(
      new NotFoundException('User with email missing@example.test not found'),
    );
  });
});
