import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run prisma seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const SALT_ROUNDS = 10;

const adminUser = {
  firstName: 'Alicia mia',
  lastName: 'Romero',
  email: 'admin@example.test',
  role: Role.ADMIN,
  isActive: true,
};

const regularUsers = [
  {
    firstName: 'Daniel',
    lastName: 'Morales',
    email: 'daniel.morales@example.test',
  },
  {
    firstName: 'Lucia',
    lastName: 'Vargas',
    email: 'lucia.vargas@example.test',
  },
  {
    firstName: 'Mateo',
    lastName: 'Santos',
    email: 'mateo.santos@example.test',
  },
  {
    firstName: 'Sofia',
    lastName: 'Herrera',
    email: 'sofia.herrera@example.test',
  },
  {
    firstName: 'Nicolas',
    lastName: 'Cruz',
    email: 'nicolas.cruz@example.test',
  },
  {
    firstName: 'Elena',
    lastName: 'Navarro',
    email: 'elena.navarro@example.test',
  },
  {
    firstName: 'Pablo',
    lastName: 'Mendez',
    email: 'pablo.mendez@example.test',
  },
  {
    firstName: 'Valeria',
    lastName: 'Iglesias',
    email: 'valeria.iglesias@example.test',
  },
  {
    firstName: 'Samuel',
    lastName: 'Ortega',
    email: 'samuel.ortega@example.test',
  },
  {
    firstName: 'Julia',
    lastName: 'Castro',
    email: 'julia.castro@example.test',
  },
];

async function seedUsers() {
  const adminPassword = await bcrypt.hash('AdminPass123!', SALT_ROUNDS);
  const userPassword = await bcrypt.hash('UserPass123!', SALT_ROUNDS);

  await prisma.user.upsert({
    where: { email: adminUser.email },
    update: {
      firstName: adminUser.firstName,
      lastName: adminUser.lastName,
      password: adminPassword,
      role: adminUser.role,
      isActive: adminUser.isActive,
    },
    create: {
      ...adminUser,
      password: adminPassword,
    },
  });

  for (const user of regularUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        firstName: user.firstName,
        lastName: user.lastName,
        password: userPassword,
        role: Role.USER,
        isActive: true,
      },
      create: {
        ...user,
        password: userPassword,
        role: Role.USER,
        isActive: true,
      },
    });
  }
}

async function main() {
  await seedUsers();
}

main()
  .catch(async (error: unknown) => {
    console.error('Failed to seed users', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
