import {
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { INTERNAL_ERROR_MESSAGE } from '../common/constants/error.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDto, UsersListResponseDto } from './dto/user-response.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(createUserDto: CreateUserDto): Promise<{ data: UserDto }> {
    try {
      const password = await this.hashPassword(createUserDto.password);
      const user = await this.prisma.user.create({
        data: {
          firstName: createUserDto.firstName,
          lastName: createUserDto.lastName,
          email: createUserDto.email.toLowerCase(),
          password,
          role: createUserDto.role ?? Role.USER,
          isActive: createUserDto.isActive ?? true,
        },
      });

      return {
        data: this.toUserDto(user),
      };
    } catch (error: unknown) {
      this.handlePrismaError(error, createUserDto.email);
    }
  }

  async listUsers(query: ListUsersQueryDto): Promise<UsersListResponseDto> {
    try {
      const where = this.buildListUsersWhere(query);
      const skip = (query.page - 1) * query.limit;

      const [total, users] = await Promise.all([
        this.prisma.user.count({ where }),
        this.prisma.user.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: [{ createdAt: query.order }, { id: query.order }],
        }),
      ]);

      const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
      const links = this.buildListUsersLinks(query, totalPages);

      return {
        data: users.map((user) => this.toUserDto(user)),
        meta: {
          page: query.page,
          limit: query.limit,
          order: query.order,
          total,
          totalPages,
          hasNext: query.page < totalPages,
          hasPrevious: query.page > 1,
          ...links,
        },
      };
    } catch (error: unknown) {
      this.handleUnexpectedError(error);
    }
  }

  async getUserById(id: number): Promise<{ data: UserDto }> {
    const user = await this.findUserOrThrow(id);

    return {
      data: this.toUserDto(user),
    };
  }

  async updateUserProfile(
    id: number,
    updateUserDto: UpdateUserDto,
  ): Promise<{ data: UserDto }> {
    await this.findUserOrThrow(id);

    const data: Prisma.UserUpdateInput = {};

    if (updateUserDto.firstName !== undefined) {
      data.firstName = updateUserDto.firstName;
    }

    if (updateUserDto.lastName !== undefined) {
      data.lastName = updateUserDto.lastName;
    }

    if (updateUserDto.password !== undefined) {
      data.password = await this.hashPassword(updateUserDto.password);
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
      });

      return {
        data: this.toUserDto(user),
      };
    } catch (error: unknown) {
      this.handleUnexpectedError(error);
    }
  }

  async updateUserRole(
    id: number,
    updateUserRoleDto: UpdateUserRoleDto,
  ): Promise<{ data: UserDto }> {
    await this.findUserOrThrow(id);

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: { role: updateUserRoleDto.role },
      });

      return {
        data: this.toUserDto(user),
      };
    } catch (error: unknown) {
      this.handleUnexpectedError(error);
    }
  }

  async updateUserStatus(
    id: number,
    updateUserStatusDto: UpdateUserStatusDto,
  ): Promise<{ data: UserDto }> {
    await this.findUserOrThrow(id);

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: { isActive: updateUserStatusDto.isActive },
      });

      return {
        data: this.toUserDto(user),
      };
    } catch (error: unknown) {
      this.handleUnexpectedError(error);
    }
  }

  private async findUserOrThrow(id: number) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id } });

      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }

      return user;
    } catch (error: unknown) {
      this.handleUnexpectedError(error);
    }
  }

  async findOneUserByEmail(email: string): Promise<User> {
    try {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        throw new NotFoundException(`User with email ${email} not found`);
      }
      return user;
    } catch (error: unknown) {
      this.handleUnexpectedError(error);
    }
  }

  async findOneUserById(id: number): Promise<User> {
    return this.findUserOrThrow(id);
  }

  private async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, SALT_ROUNDS);
  }

  private buildListUsersWhere(query: ListUsersQueryDto): Prisma.UserWhereInput {
    const filters: Prisma.UserWhereInput[] = [];

    if (query.firstName) {
      filters.push({
        firstName: {
          contains: query.firstName,
          mode: 'insensitive',
        },
      });
    }

    if (query.lastName) {
      filters.push({
        lastName: {
          contains: query.lastName,
          mode: 'insensitive',
        },
      });
    }

    if (query.email) {
      filters.push({
        email: {
          contains: query.email,
          mode: 'insensitive',
        },
      });
    }

    return filters.length > 0 ? { AND: filters } : {};
  }

  private buildListUsersLinks(
    query: ListUsersQueryDto,
    totalPages: number,
  ): Pick<UsersListResponseDto['meta'], 'next' | 'previous'> {
    const buildLink = (page: number): string => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(query.limit));
      params.set('order', query.order);

      if (query.firstName) {
        params.set('firstName', query.firstName);
      }

      if (query.lastName) {
        params.set('lastName', query.lastName);
      }

      if (query.email) {
        params.set('email', query.email);
      }

      return `/api/v1/users?${params.toString()}`;
    };

    return {
      next: query.page < totalPages ? buildLink(query.page + 1) : undefined,
      previous: query.page > 1 ? buildLink(query.page - 1) : undefined,
    };
  }

  private toUserDto(user: User): UserDto {
    const { password: _password, ...publicUser } = user;

    return publicUser;
  }

  private handlePrismaError(error: unknown, email: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(`User with email ${email} already exists`);
    }

    this.handleUnexpectedError(error);
  }

  private handleUnexpectedError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    throw new InternalServerErrorException(INTERNAL_ERROR_MESSAGE);
  }
}
